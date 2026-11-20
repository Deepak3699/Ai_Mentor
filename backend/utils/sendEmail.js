import nodemailer from "nodemailer";
import buildLogger from "./logger.js";

const log = buildLogger("EMAIL");

const sendEmail = async (options) => {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_PORT == 465, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const message = {
    from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
    to: options.email,
    subject: options.subject,
    text: options.message,
    html: options.html,
  };

  try {
    const info = await transporter.sendMail(message);

    log.info({ event: "email_send", outcome: "success" }, "[email] send success");

    return info;
  } catch (error) {
    log.error({ event: "email_send", outcome: "failure" }, "[email] send failed");

    throw error;
  }
};

export default sendEmail;
