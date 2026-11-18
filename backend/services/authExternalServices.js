import admin from "firebase-admin";
import cloudinary from "../config/cloudinary.js";
import sendEmail from "../utils/sendEmail.js";

export const authServices = {
  verifyGoogleIdToken(idToken) {
    return admin.auth().verifyIdToken(idToken);
  },
  uploadAvatar(url, options) {
    return cloudinary.uploader.upload(url, options);
  },
  sendEmail(options) {
    return sendEmail(options);
  },
};
