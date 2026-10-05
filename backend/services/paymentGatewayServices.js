import Stripe from "stripe";
import Razorpay from "razorpay";

let stripeClient;
let razorpayClient;

const getStripe = () => {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("Missing STRIPE_SECRET_KEY environment variable");
  }
  stripeClient ??= new Stripe(process.env.STRIPE_SECRET_KEY);
  return stripeClient;
};

const getRazorpay = () => {
  const missing = ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"].filter(
    (key) => !process.env[key],
  );
  if (missing.length > 0) {
    throw new Error(`Missing Razorpay environment variables: ${missing.join(", ")}`);
  }
  razorpayClient ??= new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
  return razorpayClient;
};

export const paymentGatewayServices = {
  createStripeCheckoutSession(options) {
    return getStripe().checkout.sessions.create(options);
  },
  createRazorpayOrder(options) {
    return getRazorpay().orders.create(options);
  },
  constructStripeWebhookEvent(payload, signature, secret) {
    return getStripe().webhooks.constructEvent(payload, signature, secret);
  },
};
