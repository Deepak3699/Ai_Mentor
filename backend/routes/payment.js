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
    const userId = req.user.id; //  from JWT token — never trust req.body for userId

    const targetCourseId = bodyCourseId || course?.id;

    // Validate inputs
    if (!targetCourseId) {
      return res.status(400).json({ error: "Invalid course data" });
    }

    // Idempotency key must be generated once client-side and reused on retry
    if (!idempotencyKey) {
      return res.status(400).json({ error: "idempotencyKey is required" });
    }

    // Load course from database — NEVER trust client price or metadata
    const courseRecord = await Course.findByPk(targetCourseId);
    if (!courseRecord || courseRecord.status !== "published") {
      return res.status(404).json({ error: "Course not found or unavailable" });
    }

    const priceValue = Number(courseRecord.priceValue);
    if (!Number.isFinite(priceValue) || priceValue <= 0) {
      return res.status(400).json({ error: "Invalid course price" });
    }

    // ─────────────────────────────────────────────────
    // STEP 1: CHECK IDEMPOTENCY
    // Ensure idempotency lookup is scoped to the requesting user
    // ─────────────────────────────────────────────────
    const existing = await Payment.findOne({ where: { idempotencyKey } });

    if (existing) {
      if (existing.userId !== userId) {
        return res.status(403).json({ error: "Unauthorized idempotency key" });
      }
      if (existing.cachedResponse && existing.cacheExpiresAt > new Date()) {
        log.info({ idempotencyKey }, "Returning cached response for key: {idempotencyKey}");
        return res.status(200).json(existing.cachedResponse);
      }
    }

    // ─────────────────────────────────────────────────
    // STEP 2: SAVE payment record FIRST (status: initiated)
    // ─────────────────────────────────────────────────
    const amount = Math.round(priceValue * 100); // ₹ → paise
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
      cacheExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hrs
    });

    // ─────────────────────────────────────────────────
    // STEP 3: CREATE Stripe session
    // ─────────────────────────────────────────────────
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
        userId: userId.toString(), //  from JWT — secure
        paymentId: payment.id,
        idempotencyKey,
      },
      success_url: successUrl,
      cancel_url: `${process.env.FRONTEND_URL}/courses`,
    });

    // ─────────────────────────────────────────────────
    // STEP 4: UPDATE payment + cache response
    // ─────────────────────────────────────────────────
    const cachedResponse = { url: session.url, paymentId: payment.id };

    await payment.update({
      status: "processing",
      stripeSessionId: session.id,
      cachedResponse,
    });

    return res.status(200).json(cachedResponse);
  } catch (error) {
    log.error({ err: error }, " Stripe Error:");
    return res.status(500).json({ error: "Stripe session failed" });
  }
});

//  GET PAYMENT STATUS — check if payment succeeded (useful when webhook is slow)
router.get("/status/:paymentId", protect, async (req, res) => {
  try {
    const payment = await Payment.findByPk(req.params.paymentId);

    if (!payment) {
      return res.status(404).json({ error: "Payment not found" });
    }

    // Only allow user to check their own payment
    if (payment.userId !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized" });
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
    return res.status(500).json({ error: "Failed to fetch payment status" });
  }
});

export default router;
