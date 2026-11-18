import { z } from "zod";

// Postgres INTEGER maximum. Payments.courseId is an INTEGER column.
const MAX_INT = 2147483647;

//  strings must be digits only
const paymentCourseId = (fieldName = "Course ID") => {
  const message = `${fieldName} must be a positive integer`;

  return z
    .union([z.string().regex(/^\d+$/, message), z.number().int(message).positive(message)], {
      error: message,
    })
    .transform((value) => Number(value))
    .pipe(z.number().positive(message).max(MAX_INT, `${fieldName} is too large`));
};

// Friendly messages for missing vs wrong-type values
const requiredString = (fieldName) =>
  z.string({
    error: (issue) =>
      issue.input === undefined ? `${fieldName} is required` : `${fieldName} must be a string`,
  });

const idempotencyKey = requiredString("idempotencyKey")
  .trim()
  .min(1, "idempotencyKey is required")
  .max(255, "idempotencyKey must be at most 255 characters");

// Used for Razorpay ids and signature
const gatewayString = (fieldName) =>
  requiredString(fieldName)
    .trim()
    .min(1, `${fieldName} is required`)
    .max(255, `${fieldName} must be at most 255 characters`);

// Stripe create-checkout-session AND Razorpay create-order (same body)
export const createPaymentSchema = z
  .strictObject({
    courseId: paymentCourseId().optional(),
    // legacy shape: only course.id is used, other course fields are allowed
    course: z.looseObject({ id: paymentCourseId() }).optional(),
    idempotencyKey,
  })
  .refine((data) => data.courseId !== undefined || data.course?.id !== undefined, {
    message: "Course ID is required",
    path: ["courseId"],
  });

// Razorpay /verify
export const verifyRazorpayPaymentSchema = z.strictObject({
  razorpay_order_id: gatewayString("razorpay_order_id"),
  razorpay_payment_id: gatewayString("razorpay_payment_id"),
  razorpay_signature: gatewayString("razorpay_signature"),
  courseId: paymentCourseId(),
  // Accepted for backwards compatibility but ignored: the server uses the stored title.
  courseTitle: z.string().trim().max(255).optional(),
});

// GET /status/:paymentId  (this describes req.params, not the body)
export const paymentStatusParamsSchema = z.strictObject({
  paymentId: z.uuid({ error: "Payment ID must be a valid UUID" }),
});
