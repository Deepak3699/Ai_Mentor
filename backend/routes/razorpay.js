import express from "express";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import { Transaction } from "sequelize";

import User from "../models/User.js";
import Payment from "../models/Payment.js";
import Course from "../models/Course.js";
import { sequelize } from "../config/db.js";
import { createNotification } from "../controllers/notificationController.js";
import { protect } from "../middleware/authMiddleware.js";
import { paymentGatewayServices } from "../services/paymentGatewayServices.js";
import buildLogger from "../utils/logger.js";

const router = express.Router();

// Fields to redact in production logs.
const prodRedactPaths = [
  "idempotencyKey",
  "userId",
  "courseTitle",
  "user.id",
  "razorpayOrderId",
  "razorpay_order_id",
  "razorpay_payment_id",
];

const log = buildLogger("RAZORPAY", prodRedactPaths);

// Rate limiter for payment creation.
const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    error: "Too many payment attempts from this IP. Please try again after 15 minutes.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
});

// CREATE ORDER

router.post("/create-order", protect, paymentLimiter, async (req, res) => {
  try {
    const { course, courseId: bodyCourseId, idempotencyKey } = req.body;
    const targetCourseId = bodyCourseId || course?.id;

    if (!targetCourseId) {
      return res.status(400).json({
        success: false,
        error: { code: "BAD_REQUEST", message: "Invalid course data", details: [] },
      });
    }

    if (!idempotencyKey) {
      return res.status(400).json({
        success: false,
        error: { code: "BAD_REQUEST", message: "idempotencyKey is required", details: [] },
      });
    }

    const userId = req.user.id;

    // Load course from database — NEVER trust client price or metadata
    const courseRecord = await Course.findByPk(targetCourseId);
    if (!courseRecord || courseRecord.status !== "published") {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Course not found or unavailable", details: [] },
      });
    }

    const priceValue = Number(courseRecord.priceValue);
    if (!Number.isFinite(priceValue) || priceValue <= 0) {
      return res.status(400).json({
        success: false,
        error: { code: "BAD_REQUEST", message: "Invalid course price", details: [] },
      });
    }

    log.info({ idempotencyKey }, "Idempotency key received");

    // Look up existing key and enforce user ownership.
    const existing = await Payment.findOne({
      where: { idempotencyKey },
    });

    if (existing) {
      if (existing.userId !== userId) {
        return res.status(403).json({
          success: false,
          error: { code: "FORBIDDEN", message: "Unauthorized idempotency key", details: [] },
        });
      }
      if (existing.cachedResponse && Object.keys(existing.cachedResponse).length > 0) {
        log.info({ idempotencyKey }, "Returning cached Razorpay response");
        return res.status(200).json(existing.cachedResponse);
      }
    }

    const amount = Math.round(priceValue * 100);
    const currency = (courseRecord.currency || "INR").toUpperCase();
    const courseTitle = courseRecord.title || "Course";

    const options = {
      amount,
      currency,
      receipt: `receipt_order_${courseRecord.id}_${Date.now()}`,
    };

    log.info({ courseTitle, userId }, "Initiating Razorpay payment");

    // Persist the payment before contacting Razorpay.
    const payment = await Payment.create({
      userId,
      courseId: courseRecord.id,
      courseTitle,
      amount,
      currency,
      status: "initiated",
      gateway: "razorpay",
      idempotencyKey,
      cacheExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    let order;

    try {
      order = await paymentGatewayServices.createRazorpayOrder(options);
    } catch (razorpayErr) {
      await payment.update({ status: "failed" });

      log.error({ err: razorpayErr }, "Razorpay order creation failed");

      throw razorpayErr;
    }

    const cachedResponse = {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      paymentId: payment.id,
    };

    await payment.update({
      status: "processing",
      razorpayOrderId: order.id,
      cachedResponse,
    });

    log.info({ razorpayOrderId: order.id }, "Razorpay order created successfully");

    return res.status(200).json(cachedResponse);
  } catch (error) {
    log.error({ err: error }, "Razorpay order creation error");

    return res.status(500).json({
      success: false,
      error: { code: "INTERNAL_SERVER_ERROR", message: "Internal Server Error", details: [] },
    });
  }
});

// VERIFY PAYMENT AND ENROLL USER

router.post("/verify", protect, async (req, res) => {
  const orderIdForLog = req.body?.razorpay_order_id || "unknown";

  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, courseId, courseTitle } =
      req.body;

    // Always take the user ID from the authenticated token.
    const userId = req.user.id;

    if (
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature ||
      courseId == null ||
      courseId === "" ||
      !Number.isFinite(Number(courseId)) ||
      !userId
    ) {
      return res.status(400).json({
        success: false,
        error: { code: "BAD_REQUEST", message: "Missing required parameters", details: [] },
      });
    }

    if (!process.env.RAZORPAY_KEY_SECRET) {
      log.error("RAZORPAY_KEY_SECRET is not configured");

      return res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Payment verification failed",
          details: [],
        },
      });
    }

    // Verify the Razorpay signature.
    const sign = `${razorpay_order_id}|${razorpay_payment_id}`;

    const expectedSign = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(sign)
      .digest("hex");

    // Compare signatures safely.
    const received = Buffer.from(razorpay_signature, "utf8");
    const expected = Buffer.from(expectedSign, "utf8");

    if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
      return res.status(400).json({
        success: false,
        error: { code: "BAD_REQUEST", message: "Invalid signature", details: [] },
      });
    }

    let user;
    let enrolledCourseId;
    let enrolledCourseTitle;
    let alreadyVerified = false;

    const transaction = await sequelize.transaction();

    try {
      // Lock the payment row to serialize concurrent verification.
      const payment = await Payment.findOne({
        where: {
          razorpayOrderId: razorpay_order_id,
          userId,
        },
        transaction,
        lock: Transaction.LOCK.UPDATE,
      });

      if (!payment) {
        await transaction.rollback();

        return res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Payment not found", details: [] },
        });
      }

      // Ensure the client has not substituted another course.
      if (payment.courseId != null && Number(courseId) !== Number(payment.courseId)) {
        await transaction.rollback();

        return res.status(400).json({
          success: false,
          error: {
            code: "BAD_REQUEST",
            message: "Course does not match the paid order",
            details: [],
          },
        });
      }

      // Idempotent response for an already-verified payment.
      if (payment.status === "success") {
        await transaction.rollback();

        return res.status(200).json({
          success: true,
          message: "Payment already verified",
        });
      }

      // Gateway verification: verify captured/paid status, amount, and currency with Razorpay
      if (paymentGatewayServices.fetchRazorpayPayment && process.env.NODE_ENV !== "test") {
        try {
          const rzpPayment = await paymentGatewayServices.fetchRazorpayPayment(razorpay_payment_id);
          if (
            !rzpPayment ||
            (rzpPayment.status !== "captured" && rzpPayment.status !== "authorized") ||
            (payment.amount != null && Number(rzpPayment.amount) !== Number(payment.amount)) ||
            (payment.currency &&
              rzpPayment.currency?.toUpperCase() !== payment.currency?.toUpperCase()) ||
            (rzpPayment.order_id && rzpPayment.order_id !== razorpay_order_id)
          ) {
            await transaction.rollback();
            return res.status(400).json({
              success: false,
              error: {
                code: "BAD_REQUEST",
                message: "Gateway payment details mismatch",
                details: [],
              },
            });
          }
        } catch (fetchErr) {
          log.error({ err: fetchErr }, "Failed to verify payment with Razorpay gateway API");
          await transaction.rollback();
          return res.status(500).json({
            success: false,
            error: {
              code: "INTERNAL_SERVER_ERROR",
              message: "Payment verification failed with gateway",
              details: [],
            },
          });
        }
      }

      // Use the database record as the source of truth.
      enrolledCourseId = Number(payment.courseId ?? courseId);
      enrolledCourseTitle = payment.courseTitle ?? courseTitle ?? "Course";

      // Confirm the user exists before updating payment status.
      user = await User.findByPk(userId, { transaction });

      if (!user) {
        await transaction.rollback();

        return res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "User not found", details: [] },
        });
      }

      // Update the payment within the same transaction.
      await payment.update(
        {
          status: "success",
          razorpayPaymentId: razorpay_payment_id,
        },
        { transaction },
      );

      log.info({ razorpay_order_id, razorpay_payment_id }, "Razorpay payment verified");

      const purchased = Array.isArray(user.purchasedCourses) ? [...user.purchasedCourses] : [];

      const alreadyPurchased = purchased.some((item) => Number(item.courseId) === enrolledCourseId);

      if (!alreadyPurchased) {
        purchased.push({
          courseId: enrolledCourseId,
          courseTitle: enrolledCourseTitle,
          purchaseDate: new Date(),
          progress: {
            completedLessons: [],
            currentLesson: null,
          },
        });

        user.purchasedCourses = purchased;
        user.changed("purchasedCourses", true);

        await user.save({ transaction });
      }

      await transaction.commit();

      alreadyVerified = false;
    } catch (err) {
      if (!transaction.finished) {
        await transaction.rollback();
      }

      throw err;
    }

    // Send notification after the transaction commits.
    // A notification failure must not undo successful enrollment.
    if (!alreadyVerified) {
      try {
        await createNotification(user.id, {
          title: "Course Enrolled",
          message: `You successfully enrolled in ${enrolledCourseTitle || "a course"}`,
          type: "course",
          metadata: {
            courseId: enrolledCourseId,
          },
        });
      } catch (err) {
        log.error({ err }, "Failed to create enrollment notification");
      }
    }

    return res.status(200).json({
      success: true,
      message: "Payment verified successfully",
    });
  } catch (error) {
    log.error(
      {
        razorpayOrderId: orderIdForLog,
        err: error,
      },
      "Razorpay verification error",
    );

    return res.status(500).json({
      success: false,
      error: { code: "INTERNAL_SERVER_ERROR", message: "Internal Server Error", details: [] },
    });
  }
});

export default router;
