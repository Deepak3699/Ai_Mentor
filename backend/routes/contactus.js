// routes/contactus.js
import express from "express";
import ContactMessage from "../models/Contactmessage.js";
import { optionalProtect } from "../middleware/authMiddleware.js";

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
router.post("/", optionalProtect, async (req, res) => {
  try {
    let { email, subject, message } = req.body;

    // Clean values
    email = email?.trim();
    subject = subject?.trim();
    message = message?.trim();

    // Manual validation
    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    if (!subject || subject.length < 3) {
      return res.status(400).json({
        success: false,
        message: "Subject must be at least 3 characters",
      });
    }

    if (!message || message.length < 10) {
      return res.status(400).json({
        success: false,
        message: "Message must be at least 10 characters",
      });
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
    // Sequelize validation errors
    if (error?.name === "SequelizeValidationError") {
      logContactFailure("validation_error");
      return res.status(400).json({
        success: false,
        message: error.errors?.[0]?.message ?? "Invalid contact message",
      });
    }

    logContactFailure("persistence_error");
    return res.status(500).json({
      success: false,
      message: "Server error while sending message",
    });
  }
});

export default router;
