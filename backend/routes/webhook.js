import express from "express";
import User from "../models/User.js";
import Payment from "../models/Payment.js";
import { createNotification } from "../controllers/notificationController.js";
import { sequelize } from "../config/db.js";
import { paymentGatewayServices } from "../services/paymentGatewayServices.js";
import buildLogger from "../utils/logger.js";

const router = express.Router();

const prodRedactPaths = ['stripeSessionId','courseId','intentId',];

const log = buildLogger('WEBHOOK', prodRedactPaths);


//Stripe webhook MUST use RAW body
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];

  let event;

    //  Verify webhook signature
    // Distinguishes between invalid signature (attack) vs missing secret (config error)
    try {
      if (!sig) {
        log.error('Missing stripe-signature header');
        return res.status(400).send("Missing stripe-signature header");
      }
      event = paymentGatewayServices.constructStripeWebhookEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      // Invalid signature = possible attack or corrupted payload
      log.error({err},'Signature verification failed');
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    switch (event.type) {

      //  PAYMENT SUCCESS
      case "checkout.session.completed": {
        const session = event.data.object;
        const courseId = session.metadata?.courseId;
        const userId = session.metadata?.userId;
        const courseTitle = session.metadata?.courseTitle;

      const transaction = await sequelize.transaction();
      try {
        if (session.id) {
          const payment = await Payment.findOne({
            where: { stripeSessionId: session.id },
            transaction,
          });

            if (payment?.status === "success") {
              await transaction.rollback();
              log.info({stripeSessionId:session.id},'Already processed');
              return res.json({ received: true });
            }

          await Payment.update(
            { status: "success", stripePaymentIntentId: session.payment_intent },
            { where: { stripeSessionId: session.id }, transaction },
          );
        }

        const user = await User.findByPk(userId, { transaction });
        if (!user) {
          await transaction.rollback();
          return res.status(404).send("User not found");
        }

        let purchased = user.purchasedCourses || [];
        const alreadyPurchased = purchased.find((c) => Number(c.courseId) === Number(courseId));

        if (!alreadyPurchased) {
          purchased.push({
            courseId: Number(courseId),
            courseTitle: courseTitle || "Course",
            purchasedAt: new Date(),
            progress: { completedLessons: [], currentLesson: null },
          });
          user.purchasedCourses = purchased;
          user.changed("purchasedCourses", true);
          await user.save({ transaction });
        }

        await transaction.commit();

          // Send notification AFTER commit
          try {
            await createNotification(user.id, {
              title: "Course Enrolled 🎉",
              message: `You successfully enrolled in ${courseTitle || "a course"}`,
              type: "course",
              metadata: { courseId },
            });
          } catch (err) {
            log.error({err},"Notification error:");
          }
          log.info({courseId,},'Payment Processed:');
        } catch (err) {
          await transaction.rollback();

          log.error({err},"DB Error:");
          
          return res.status(500).send("Internal Server Error");
        }
        break;
      }

      //  SESSION EXPIRED
      case "checkout.session.expired": {
        const session = event.data.object;
        if (session.id) {
          await Payment.update(
            { status: "failed" },
            { where: { stripeSessionId: session.id } }
          ).catch((err) =>
      log.error({ err }, "Failed to mark expired session as failed")
    );
          log.info({stripeSessionId:session.id},'Session expired - marked failed:');
        }
        break;
      }

      //  PAYMENT FAILED
      case "payment_intent.payment_failed": {
        const intent = event.data.object;
        log.error({intentId:intent.id,}, 'PaymentIntent failed:');
        break;
      }

      default:
        log.error({eventType:event.type},'Unhandled event:');
    }

  res.json({ received: true });
});

export default router;
