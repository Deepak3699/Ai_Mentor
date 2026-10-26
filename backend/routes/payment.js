import express from "express";
import rateLimit from "express-rate-limit";
import { protect } from "../middleware/authMiddleware.js";
import Payment from "../models/Payment.js";
import Course from "../models/Course.js";
import { paymentGatewayServices } from "../services/paymentGatewayServices.js";
import buildLogger from "../utils/logger.js";

const router = express.Router();

const prodRedactPaths = ["idempotencyKey"];

const log = buildLogger("PAYMENT", prodRedactPaths);

const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: { error: "Too many payment attempts. Try again after 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
});

//  CREATE CHECKOUT SESSION — with idempotency protection
router.post("/create-checkout-session", protect, paymentLimiter, async (req, res) => {
  try {
    const { course, courseId: bodyCourseId, idempotencyKey } = req.body;
    const userId = req.user.id;

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

    const existing = await Payment.findOne({ where: { idempotencyKey } });

    if (existing) {
      if (existing.userId !== userId) {
        return res.status(403).json({
          success: false,
          error: { code: "FORBIDDEN", message: "Unauthorized idempotency key", details: [] },
        });
      }
      if (existing.cachedResponse && existing.cacheExpiresAt > new Date()) {
        log.info({ idempotencyKey }, "Returning cached response for key: {idempotencyKey}");
        return res.status(200).json(existing.cachedResponse);
      }
    }

    const amount = Math.round(priceValue * 100);
    const currency = (courseRecord.currency || "inr").toLowerCase();
    const courseTitle = courseRecord.title;

    const payment = await Payment.create({
      userId,
      courseId: courseRecord.id,
      courseTitle,
      amount,
      currency,
      status: "initiated",
      idempotencyKey,
      gateway: "stripe",
      cacheExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    const successUrl = `${process.env.FRONTEND_URL}/success?courseId=${courseRecord.id}&title=${encodeURIComponent(courseTitle)}`;

    const session = await paymentGatewayServices.createStripeCheckoutSession({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency,
            product_data: { name: courseTitle },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      metadata: {
        courseId: courseRecord.id.toString(),
        courseTitle,
        userId: userId.toString(),
        paymentId: payment.id,
        idempotencyKey,
      },
      success_url: successUrl,
      cancel_url: `${process.env.FRONTEND_URL}/courses`,
    });

    const cachedResponse = { url: session.url, paymentId: payment.id };

    await payment.update({
      status: "processing",
      stripeSessionId: session.id,
      cachedResponse,
    });

    return res.status(200).json(cachedResponse);
  } catch (error) {
    log.error({ err: error }, " Stripe Error:");
    return res.status(500).json({
      success: false,
      error: { code: "INTERNAL_SERVER_ERROR", message: "Internal Server Error", details: [] },
    });
  }
});

//  GET PAYMENT STATUS — check if payment succeeded (useful when webhook is slow)
router.get("/status/:paymentId", protect, async (req, res) => {
  try {
    const payment = await Payment.findByPk(req.params.paymentId);

    if (!payment) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Payment not found", details: [] },
      });
    }

    // Only allow user to check their own payment
    if (payment.userId !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: { code: "FORBIDDEN", message: "Unauthorized", details: [] },
      });
    }

    return res.status(200).json({
      paymentId: payment.id,
      status: payment.status,
      courseId: payment.courseId,
      courseTitle: payment.courseTitle,
      amount: payment.amount,
      currency: payment.currency,
      gateway: payment.gateway,
      createdAt: payment.createdAt,
    });
  } catch (error) {
    log.error({ err: error }, " Payment Status Error:");
    return res.status(500).json({
      success: false,
      error: { code: "INTERNAL_SERVER_ERROR", message: "Internal Server Error", details: [] },
    });
  }
});

export default router;
