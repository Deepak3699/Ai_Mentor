
import AIVideo from "../models/AIVideo.js";
import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import validate from "../middleware/validate.js";
import { generateVideoSchema } from "../schemas/aiSchema.js";
import { getCourseAndLessonTitles } from "../controllers/courseController.js";
import Preferences from "../models/Preference.js";
import hasCourseAccess from "../utils/courseAccess.js";
import dotenv from "dotenv";

dotenv.config();

const router = express.Router();

const isAdminUser = (user) => {
  const role = String(user?.role || "").toLowerCase();
  return role === "admin" || role === "superadmin";
};

const getVideoWhere = (courseId, lessonId, celebrity) => ({
  courseId: Number(courseId),
  lessonId: Number(lessonId),
  celebrity: String(celebrity).toLowerCase(),
});

// Generate an AI video for a lesson.
router.post(
  "/generate-video",
  protect,
  validate(generateVideoSchema),
  async (req, res) => {
    let reservedVideo = null;

    try {
      const {
        courseId,
        lessonId,
        celebrity,
        voice_id,
        speech_rate,
        speech_pitch,
      } = req.body;

      // Verify course access before doing any generation work.
      if (!hasCourseAccess(req.user, courseId)) {
        return res.status(403).json({
          message: "You do not have access to this course",
        });
      }

      const videoWhere = getVideoWhere(courseId, lessonId, celebrity);

      // Check whether a video already exists for this lesson.
      const cachedVideo = await AIVideo.findOne({
        where: videoWhere,
      });

      if (cachedVideo) {
        // A reservation or generation job is already in progress.
        if (!cachedVideo.videoUrl) {
          if (!cachedVideo.jobId) {
            return res.status(409).json({
              message:
                "Video generation is already being started. Please try again shortly.",
            });
          }

          if (
            !isAdminUser(req.user) &&
            String(cachedVideo.userId) !== String(req.user.id)
          ) {
            return res.status(409).json({
              message:
                "A video for this lesson is already being generated",
            });
          }

          return res.json({
            jobId: cachedVideo.jobId,
            status: "processing",
            message: "Video generation is already in progress",
          });
        }

        // Cloudinary-hosted cached videos can be returned directly.
        let parsedUrl;

        try {
          parsedUrl = new URL(cachedVideo.videoUrl);
        } catch {
          parsedUrl = null;
        }

        if (
          parsedUrl &&
          parsedUrl.protocol === "https:" &&
          parsedUrl.hostname.endsWith("res.cloudinary.com")
        ) {
          return res.json({
            videoUrl: cachedVideo.videoUrl,
            transcriptName: cachedVideo.transcriptName,
            jobId: cachedVideo.jobId,
            cached: true,
          });
        }

        // Verify videos hosted by the AI service still exist.
        const filename = cachedVideo.videoUrl.split("/").pop();

        const videoCheck = await fetch(
          `${process.env.AI_SERVICE_URL}/video-stream/${encodeURIComponent(filename)}`,
          { method: "HEAD" }
        );

        if (videoCheck.ok) {
          return res.json({
            videoUrl: cachedVideo.videoUrl,
            transcriptName: cachedVideo.transcriptName,
            jobId: cachedVideo.jobId,
            cached: true,
          });
        }

        // Remove an invalid cache entry before attempting regeneration.
        await cachedVideo.destroy();
      }

      // Verify the requested course and lesson exist.
      const titles = await getCourseAndLessonTitles(courseId, lessonId);

      if (!titles) {
        return res.status(404).json({
          message: "Invalid course or lesson",
        });
      }

      const { courseTitle, lessonTitle } = titles;

      const userPreferencesRecord = await Preferences.findOne({
        where: { user_id: req.user.id },
      });

      const userPreferences = userPreferencesRecord
        ? userPreferencesRecord.toJSON()
        : null;

      // Reserve the unique video record before calling the AI service.
      // The unique course/lesson/celebrity index prevents duplicate reservations.
      const [videoRecord, created] = await AIVideo.findOrCreate({
        where: videoWhere,
        defaults: {
          userId: req.user.id,
          courseId: Number(courseId),
          lessonId: Number(lessonId),
          celebrity: String(celebrity).toLowerCase(),
          videoUrl: "",
          jobId: null,
          transcriptName: null,
        },
      });

      if (!created) {
        // Never transfer a job with unknown or different ownership.
        if (
          !videoRecord.userId ||
          String(videoRecord.userId) !== String(req.user.id)
        ) {
          return res.status(409).json({
            message:
              "A video for this lesson already exists and ownership cannot be verified",
          });
        }

        return res.status(409).json({
          message:
            "A video for this lesson is already being generated",
        });
      }

      reservedVideo = videoRecord;

      // Ask the AI service to start generating the video.
      const response = await fetch(
        `${process.env.AI_SERVICE_URL}/generate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            course: courseTitle,
            topic: lessonTitle,
            celebrity,
            preferences: userPreferences,
            voice_id,
            speech_rate,
            speech_pitch,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("AI service request failed");
      }

      const data = await response.json();

      // No job was created, so remove the reservation.
      if (!data.jobId) {
        await reservedVideo.destroy();
        reservedVideo = null;
        return res.json(data);
      }

      // Save the job ID and transcript information against its owner.
      reservedVideo.jobId = String(data.jobId);
      reservedVideo.transcriptName = data.text_file || null;
      await reservedVideo.save();

      return res.json(data);
    } catch (error) {
      if (reservedVideo) {
        try {
          await reservedVideo.destroy();
        } catch (cleanupError) {
          console.error(
            "Failed to remove AI video reservation:",
            cleanupError.message
          );
        }
      }

      console.error("AI GENERATE ERROR:", error);
      return res.status(500).json({
        message: "Failed to generate AI video",
      });
    }
  }
);

// Proxy transcript content from the AI service.
router.get("/transcript/:filename", async (req, res) => {
  try {
    const { filename } = req.params;

    const cachedVideo = await AIVideo.findOne({
      where: { transcriptName: filename },
    });

    if (cachedVideo && cachedVideo.transcript) {
      return res.json({ content: cachedVideo.transcript });
    }

    const response = await fetch(
      `${process.env.AI_SERVICE_URL}/transcript/${encodeURIComponent(filename)}`
    );

    if (!response.ok) {
      return res.status(404).json({
        error: "Transcript not found",
      });
    }

    const data = await response.json();

    if (cachedVideo) {
      cachedVideo.transcript = data.content;
      await cachedVideo.save();
    }

    return res.json(data);
  } catch (error) {
    console.error("Transcript Proxy Error:", error.message);
    return res.status(500).json({
      error: "Failed to load transcript",
    });
  }
});

// Check a generation job's status only after verifying its owner.
router.get("/status/:jobId", protect, async (req, res) => {
  try {
    const { jobId } = req.params;

    const videoRecord = await AIVideo.findOne({
      where: { jobId: String(jobId) },
    });

    if (!videoRecord) {
      return res.status(404).json({
        status: "not_found",
      });
    }

    if (
      !isAdminUser(req.user) &&
      String(videoRecord.userId) !== String(req.user.id)
    ) {
      return res.status(403).json({
        message: "You do not have access to this video job",
      });
    }

    const response = await fetch(
      `${process.env.AI_SERVICE_URL}/status/${encodeURIComponent(jobId)}`
    );

    if (!response.ok) {
      return res.status(404).json({
        status: "not_found",
      });
    }

    const data = await response.json();

    // Persist the final video URL when generation completes.
    if (data.status === "ready" && data.cloudinary_url) {
      try {
        const updated = await AIVideo.update(
          { videoUrl: data.cloudinary_url },
          { where: { jobId: String(jobId) } }
        );

        if (updated[0] > 0) {
          console.log(
            `AIVideo DB updated with Cloudinary URL for jobId: ${jobId}`
          );
        }
      } catch (dbError) {
        console.error(
          "Failed to update AIVideo with Cloudinary URL:",
          dbError.message
        );
      }
    }

    return res.json(data);
  } catch (error) {
    console.error("Status Proxy Error:", error.message);
    return res.status(500).json({
      status: "error",
    });
  }
});

// Proxy video streams from the AI service.
router.get("/video/:courseId/:filename", protect, async (req, res) => {
  try {
    const { courseId, filename } = req.params;
    const numericCourseId = Number(courseId);

    if (!Number.isInteger(numericCourseId)) {
      return res.status(404).json({
        error: "Video not found",
      });
    }

    const isEnrolled = (req.user.purchasedCourses || []).some(
      (course) => Number(course.courseId) === numericCourseId
    );

    if (!isEnrolled) {
      return res.status(403).json({
        error: "Course not purchased",
      });
    }

    if (!filename.endsWith(".mp4")) {
      return res.status(404).json({
        error: "Video not found",
      });
    }

    const jobId = filename.slice(0, -".mp4".length);

    const video = await AIVideo.findOne({
      where: {
        courseId: numericCourseId,
        jobId,
      },
    });

    if (!video) {
      return res.status(404).json({
        error: "Video not found",
      });
    }

    const response = await fetch(
      `${process.env.AI_SERVICE_URL}/video-stream/${encodeURIComponent(filename)}`
    );

    if (!response.ok) {
      return res.status(404).json({
        error: "Video not found in AI service",
      });
    }

    res.setHeader("Content-Type", "video/mp4");

    const reader = response.body.getReader();

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      res.write(value);
    }

    return res.end();
  } catch (error) {
    console.error("Proxy Error:", error.message);
    return res.status(500).json({
      error: "Failed to load video via proxy",
    });
  }
});

// Proxy available voices from the AI service.
router.get("/voices", protect, async (req, res) => {
  try {
    const response = await fetch(
      `${process.env.AI_SERVICE_URL}/voices`
    );

    if (!response.ok) {
      throw new Error("Failed to fetch voices");
    }

    const data = await response.json();
    return res.json(data);
  } catch (error) {
    console.error("Voices Proxy Error:", error.message);
    return res.status(500).json({
      error: "Failed to fetch voices",
    });
  }
});

export default router;
