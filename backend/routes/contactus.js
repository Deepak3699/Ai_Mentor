// routes/contactus.js
import express from "express";
import ContactMessage from "../models/Contactmessage.js";
import { optionalProtect } from "../middleware/authMiddleware.js";
import { BadRequestError, ValidationError } from "../utils/error.js";

const router = express.Router();

const logContactFailure = (classification) => {
  console.error(JSON.stringify({ event: "contact_failure", classification }));
};

/*
POST /api/contactus
Body:
{
  email: "user@gmail.com",
  subject: "Need Help",
  message: "My message here..."
}
*/
router.post("/", optionalProtect, async (req, res, next) => {
  try {
    let { email, subject, message } = req.body;

    email = email?.trim();
    subject = subject?.trim();
    message = message?.trim();

    if (!email) {
      throw new BadRequestError("Email is required");
    }

    if (!subject || subject.length < 3) {
      throw new BadRequestError("Subject must be at least 3 characters");
    }

    if (!message || message.length < 10) {
      throw new BadRequestError("Message must be at least 10 characters");
    }

    // Save message in DB - userId derived securely from auth token, not body
    const savedMessage = await ContactMessage.create({
      userId: req.user?.id ?? null,
      email,
      subject,
      message,
    });

    return res.status(201).json({
      success: true,
      message: "Your message has been sent successfully!",
      data: savedMessage,
    });
  } catch (error) {
    if (error?.name === "SequelizeValidationError") {
      logContactFailure("validation_error");
      const details = (error.errors || []).map((issue) => ({
        path: issue.path || "email",
        message: issue.message,
      }));
      const validationError = new ValidationError(details, "Request validation failed");
      return res.status(validationError.statusCode).json({
        success: false,
        error: {
          code: validationError.code,
          message: validationError.message,
          details: validationError.details,
        },
      });
    }

    logContactFailure("persistence_error");
    return next(error);
  }
});

export default router;
