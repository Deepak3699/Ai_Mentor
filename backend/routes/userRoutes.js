// backend/routes/userRoutes.js
import express from "express";
import multer from "multer";
import path from "path";
import { protect } from "../middleware/authMiddleware.js";
import validate from "../middleware/validate.js";
import { registerSchema, loginSchema } from "../schemas/authSchema.js";
import {
  updateProfileSchema,
  changePasswordSchema,
  purchaseCourseSchema,
  courseProgressSchema,
  updateSettingsSchema,
  removeCourseSchema,
} from "../schemas/userSchema.js";

import {
  registerUser,
  loginUser,
  getUserProfile,
  updateUserProfile,
  removeProfileAvatar,
  purchaseCourse,
  updateCourseProgress,
  getWatchedVideos,
  getUserSettings,
  updateUserSettings,
  removePurchasedCourse,
  deleteAccount,
  changePassword,
  completeProfile,
} from "../controllers/userController.js";
import crypto from "crypto";
import { loginLimiter, registerLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `${crypto.randomBytes(16).toString("hex")}${ext}`;
    cb(null, safeName);
  },
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(file.mimetype) || !ALLOWED_EXTENSIONS.has(ext)) {
    return cb(new Error("Only JPEG, PNG, and WebP images are allowed"), false);
  }
  cb(null, true);
};

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB max
  fileFilter,
});

const uploadAvatar = (req, res, next) => {
  upload.single("avatar")(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          success: false,
          error: {
            code: "BAD_REQUEST",
            message: "Avatar file size must not exceed 2MB",
            details: [],
          },
        });
      }
      return res.status(400).json({
        success: false,
        error: { code: "BAD_REQUEST", message: err.message || "File upload error", details: [] },
      });
    }
    next();
  });
};

/* ---------- AUTH ROUTES ---------- */

router.post("/register", registerLimiter, validate(registerSchema), registerUser);
router.post("/login", loginLimiter, validate(loginSchema), loginUser);

/* ---------- FIRST-TIME ONBOARDING ---------- */
// Accepts avatar via multipart form data, requires JWT auth
router.post("/complete-profile", protect, uploadAvatar, completeProfile);

/* ---------- USER ROUTES ---------- */

router
  .route("/profile")
  .get(protect, getUserProfile)
  .put(protect, uploadAvatar, validate(updateProfileSchema), updateUserProfile);
router.delete("/profile/avatar", protect, removeProfileAvatar);

router.put("/change-password", protect, validate(changePasswordSchema), changePassword);

router.post("/purchase-course", protect, validate(purchaseCourseSchema), purchaseCourse);

router.put("/course-progress", protect, validate(courseProgressSchema), updateCourseProgress);

router.get("/watched-videos", protect, getWatchedVideos);

router
  .route("/settings")
  .get(protect, getUserSettings)
  .put(protect, validate(updateSettingsSchema), updateUserSettings);

router.post("/remove-course", protect, validate(removeCourseSchema), removePurchasedCourse);

router.delete("/delete-account", protect, deleteAccount);

export default router;
