// backend/routes/userRoutes.js
import express from "express";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import fs from "fs";
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

const router = express.Router();

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.resolve("uploads");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const safeExt = ALLOWED_EXTENSIONS.has(ext) ? ext : ".jpg";
    const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
    cb(null, `avatar-${uniqueSuffix}${safeExt}`);
  },
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || "").toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(file.mimetype) || !ALLOWED_EXTENSIONS.has(ext)) {
    const error = new Error("Invalid file type. Only JPEG, PNG, WEBP, and GIF images are allowed.");
    error.status = 400;
    return cb(error, false);
  }
  cb(null, true);
};

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter,
});

const uploadAvatar = (req, res, next) => {
  upload.single("avatar")(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            success: false,
            message: "File too large. Maximum size is 5MB.",
          });
        }
        return res.status(400).json({ success: false, message: err.message });
      }
      return res.status(err.status || 400).json({ success: false, message: err.message });
    }

    if (req.file) {
      let cleanedUp = false;
      const cleanup = () => {
        if (!cleanedUp && req.file?.path) {
          cleanedUp = true;
          fs.promises.unlink(req.file.path).catch(() => {});
        }
      };

      res.on("finish", () => {
        if (res.statusCode >= 400) {
          cleanup();
        }
      });

      res.on("close", () => {
        if (!res.writableEnded) {
          cleanup();
        }
      });
    }

    next();
  });
};

/* ---------- AUTH ROUTES ---------- */

router.post("/register", validate(registerSchema), registerUser);
router.post("/login", validate(loginSchema), loginUser);

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
