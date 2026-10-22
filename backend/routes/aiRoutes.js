import AIVideo from "../models/AIVideo.js";
import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import validate from "../middleware/validate.js";
import { generateVideoSchema, explainCodeSchema } from "../schemas/aiSchema.js";
import { getCourseAndLessonTitles } from "../controllers/courseController.js";
import Preferences from "../models/Preference.js";
import { getVideoQueue } from "../queues/videoQueue.js";
import { videoGenerationLimiter } from "../middleware/aiRateLimiter.js";
import { Op } from "sequelize";
import dotenv from "dotenv";
dotenv.config();

const router = express.Router();

export const tryServeCompletedVideo = async (aiVideo, res) => {
  if (!aiVideo) return false;

  // Return a valid completed Cloudinary cache immediately.
  if ((aiVideo.status === "completed" || !aiVideo.status) && aiVideo.videoUrl) {
    let parsedUrl;

    try {
      parsedUrl = new URL(aiVideo.videoUrl);
    } catch {
      parsedUrl = null;
    }

    if (
      parsedUrl &&
      parsedUrl.protocol === "https:" &&
      parsedUrl.hostname.endsWith("res.cloudinary.com")
    ) {
      res.json({
        videoUrl: aiVideo.videoUrl,
        transcriptName: aiVideo.transcriptName,
        jobId: aiVideo.jobId,
        meta: aiVideo.meta,
        cached: true,
      });
      return true;
    }

    // Verify a local video only when a URL exists.
    if (aiVideo.videoUrl.trim()) {
      const filename = aiVideo.videoUrl.split("/").pop();

      try {
        const check = await fetch(
          `${process.env.AI_SERVICE_URL}/video-stream/${encodeURIComponent(filename)}`,
          { method: "HEAD" },
        );

        if (check.ok) {
          res.json({
            videoUrl: aiVideo.videoUrl,
            transcriptName: aiVideo.transcriptName,
            jobId: aiVideo.jobId,
            meta: aiVideo.meta,
            cached: true,
          });
          return true;
        }
      } catch {
        console.warn("Cached video verification failed");
      }
    }
  }

  return false;
};

export const tryServeExistingVideo = async (aiVideo, res, req = null) => {
  if (!aiVideo) return false;

  // Serve completed video to any authorized learner
  if (await tryServeCompletedVideo(aiVideo, res)) {
    return true;
  }

  // Handle in-progress generation
  if (["pending", "processing"].includes(aiVideo.status)) {
    const isOwner = req?.user && aiVideo.userId && String(aiVideo.userId) === String(req.user.id);
    const isAdmin = req?.user && (req.user.role === "admin" || req.user.role === "superadmin");

    if (!req || isOwner || isAdmin) {
      res.json({
        jobId: aiVideo.id,
        status: "processing",
        message: "Video generation is already in progress",
      });
    } else {
      // In-flight job is private to requester: inform another learner without exposing private jobId
      res.json({
        status: "processing",
        message: "Video generation is already in progress",
      });
    }
    return true;
  }

  return false;
};

export const serveCachedVideo = async (req, res, next) => {
  try {
    const { courseId, lessonId, celebrity } = req.body;

    // 🔐 Check purchase
    const purchasedCourse = (req.user?.purchasedCourses || []).find(
      (course) => Number(course.courseId) === Number(courseId),
    );

    if (!purchasedCourse) {
      return res.status(403).json({ message: "Course not purchased" });
    }

    const key = {
      courseId: Number(courseId),
      lessonId: Number(lessonId),
      celebrity: String(celebrity).toLowerCase(),
    };

    const aiVideo = await AIVideo.findOne({ where: key });
    if (!aiVideo) {
      return next();
    }

    // 1. Shared course-video cache: completed videos are accessible to any enrolled learner
    if (await tryServeCompletedVideo(aiVideo, res)) {
      return;
    }

    // 2. Private in-flight generation: only return to owner or admin before the rate limiter.
    // Another learner must NOT get another learner's private in-flight job from the cache-before-limiter path.
    const isOwner = req.user && aiVideo.userId && String(aiVideo.userId) === String(req.user.id);
    const isAdmin = req.user && (req.user.role === "admin" || req.user.role === "superadmin");

    if (["pending", "processing"].includes(aiVideo.status) && (isOwner || isAdmin)) {
      return res.json({
        jobId: aiVideo.id,
        status: "processing",
        message: "Video generation is already in progress",
      });
    }

    // Cache miss or another learner's private in-flight job: pass to rate limiter and generation handler
    return next();
  } catch {
    console.error("AI GENERATE CACHE ERROR");
    return res.status(500).json({ message: "Failed to check AI video cache" });
  }
};

router.post(
  "/generate-video",
  protect,
  validate(generateVideoSchema),
  serveCachedVideo,
  videoGenerationLimiter,
  async (req, res) => {
    let aiVideo;

    try {
      const { courseId, lessonId, celebrity, voice_id, speech_rate, speech_pitch } = req.body;

      const purchasedCourse = (req.user?.purchasedCourses || []).find(
        (course) => Number(course.courseId) === Number(courseId),
      );

      if (!purchasedCourse) {
        return res.status(403).json({ message: "Course not purchased" });
      }

      const key = {
        courseId: Number(courseId),
        lessonId: Number(lessonId),
        celebrity: String(celebrity).toLowerCase(),
      };

      const sendProcessing = (record, message = "Video generation is already in progress") => {
        const isOwner = req.user && record.userId && String(record.userId) === String(req.user.id);
        const isAdmin = req.user && (req.user.role === "admin" || req.user.role === "superadmin");
        if (isOwner || isAdmin) {
          return res.json({
            jobId: record.id,
            status: "processing",
            message,
          });
        }
        return res.json({
          status: "processing",
          message,
        });
      };

      const resetVideoFields = {
        userId: req.user.id,
        videoUrl: "",
        transcriptName: "",
        jobId: null,
        status: "pending",
        error: null,
        meta: null,
      };

      // Atomically claim only failed or completed records.
      // A concurrent request cannot claim the same record twice.
      const claimExistingVideo = async (record) => {
        const [updatedCount] = await AIVideo.update(resetVideoFields, {
          where: {
            id: record.id,
            status: { [Op.in]: ["failed", "completed"] },
          },
        });

        await record.reload();
        return updatedCount === 1;
      };

      aiVideo = await AIVideo.findOne({ where: key });

      if (aiVideo && (await tryServeExistingVideo(aiVideo, res, req))) {
        return;
      }

      const titles = await getCourseAndLessonTitles(courseId, lessonId);

      if (!titles) {
        return res.status(404).json({ message: "Invalid course or lesson" });
      }

      const { courseTitle, lessonTitle } = titles;

      const preferencesRecord = await Preferences.findOne({
        where: { user_id: req.user.id },
      });

      const userPreferences = preferencesRecord ? preferencesRecord.toJSON() : null;

      if (aiVideo) {
        const claimed = await claimExistingVideo(aiVideo);

        if (!claimed) {
          if (["pending", "processing"].includes(aiVideo.status)) {
            return sendProcessing(aiVideo);
          }

          return res.status(409).json({
            message: "Video generation state changed. Please retry.",
          });
        }
      } else {
        try {
          aiVideo = await AIVideo.create({
            ...key,
            userId: req.user.id,
            videoUrl: "",
            transcriptName: "",
            status: "pending",
          });
        } catch (error) {
          if (error.name !== "SequelizeUniqueConstraintError") {
            throw error;
          }

          // Another request may have created the same record concurrently.
          aiVideo = await AIVideo.findOne({ where: key });

          if (!aiVideo) {
            throw error;
          }

          if (await tryServeExistingVideo(aiVideo, res, req)) {
            return;
          }

          const claimed = await claimExistingVideo(aiVideo);

          if (!claimed) {
            if (["pending", "processing"].includes(aiVideo.status)) {
              return sendProcessing(aiVideo);
            }

            return res.status(409).json({
              message: "Video generation state changed. Please retry.",
            });
          }
        }
      }

      try {
        const queue = getVideoQueue();

        const job = await queue.add(
          "generate-video",
          {
            aiVideoId: aiVideo.id,
            courseId,
            lessonId,
            celebrity,
            courseTitle,
            lessonTitle,
            userPreferences,
            voice_id,
            speech_rate,
            speech_pitch,
          },
          {
            jobId: aiVideo.id,
          },
        );

        console.log(`Job added to queue: ${job.id}, DB ID: ${aiVideo.id}`);

        return res.json({
          jobId: aiVideo.id,
          status: "processing",
          message: "Video generation started",
        });
      } catch (queueError) {
        if (aiVideo?.update) {
          await aiVideo.update({
            status: "failed",
            error: "Video generation job could not be queued",
          });
        }

        throw queueError;
      }
    } catch {
      console.error("AI GENERATE ERROR: Video generation request failed");
      return res.status(500).json({ message: "Failed to generate AI video" });
    }
  },
);

// Proxy Transcript Content from Python
// ----------------------------------------------------
router.get("/transcript/:filename", async (req, res) => {
  try {
    const { filename } = req.params;

    // 🕵️ Check Cache First
    const cachedVideo = await AIVideo.findOne({
      where: { transcriptName: filename },
    });

    if (cachedVideo && cachedVideo.transcript) {
      console.log("🎯 Serving cached transcript for:", filename);
      return res.json({ content: cachedVideo.transcript });
    }

    const pythonTranscriptUrl = `${process.env.AI_SERVICE_URL}/transcript/${filename}`;
    const response = await fetch(pythonTranscriptUrl);

    if (!response.ok) {
      return res.status(404).json({ error: "Transcript not found" });
    }

    const data = await response.json();

    // 💾 Save to Cache if we found the record
    if (cachedVideo) {
      cachedVideo.transcript = data.content;
      await cachedVideo.save();
      console.log("💾 Transcript cached for:", filename);
    }

    res.json(data);
  } catch (error) {
    console.error("❌ Transcript Proxy Error:", error.message);
    res.status(500).json({ error: "Failed to load transcript" });
  }
});

router.get("/status/:jobId", protect, async (req, res) => {
  try {
    const { jobId } = req.params; // This is now aiVideo.id

    // Check DB first
    const videoJob = await AIVideo.findOne({ where: { id: jobId } });

    if (!videoJob) {
      return res.status(404).json({ status: "not_found" });
    }

    const isAdmin = req.user && (req.user.role === "admin" || req.user.role === "superadmin");

    // 1. Shared course-video cache authorization:
    // If the video is completed and has a videoUrl, it is a shared course asset.
    // Any learner enrolled in this course, the creator, or an admin can access it.
    if (videoJob.status === "completed" && videoJob.videoUrl) {
      const isEnrolled = (req.user?.purchasedCourses || []).some(
        (c) => Number(c.courseId) === Number(videoJob.courseId),
      );

      if (!isAdmin && videoJob.userId !== req.user.id && !isEnrolled) {
        return res.status(403).json({ error: "Access denied" });
      }

      return res.json({
        status: "ready",
        cloudinary_url: videoJob.videoUrl,
        transcriptName: videoJob.transcriptName,
        jobId: jobId, // return same ID to frontend
        meta: videoJob.meta,
      });
    }

    // 2. In-flight (pending / processing) and failed generation requests:
    // These represent private generation requests.
    // Only the verified job owner or an authorized administrator may view in-flight status or poll.
    // For legacy/ownerless records (userId === null), normal users fail closed (403), while admins can access.
    if (!isAdmin && (!videoJob.userId || videoJob.userId !== req.user.id)) {
      return res.status(403).json({ error: "Access denied" });
    }

    if (videoJob.status === "failed") {
      return res.json({ status: "failed", error: videoJob.error || "Video generation failed" });
    }

    if (videoJob.status === "pending") {
      return res.json({ status: "processing", message: "In queue..." });
    }

    // If processing but no python jobId yet
    if (!videoJob.jobId) {
      return res.json({ status: "processing", message: "Starting..." });
    }

    // Poll Python service using the python jobId
    const response = await fetch(`${process.env.AI_SERVICE_URL}/status/${videoJob.jobId}`);

    if (!response.ok) {
      return res.json({ status: "processing" });
    }

    const data = await response.json();

    // Persist ready results by the database record ID.
    if (data.status === "ready" && data.local_video_url && videoJob) {
      const filename = data.local_video_url.split("/").pop();
      data.local_video_url = `/api/ai/video/${videoJob.courseId}/${filename}`;
    }

    const updateWhere = isAdmin ? { id: jobId } : { id: jobId, userId: req.user.id };

    if (data.status === "ready") {
      const completedVideoUrl = data.cloudinary_url || data.local_video_url;

      if (!completedVideoUrl) {
        console.error("AI service reported ready without video output");
        return res.status(502).json({
          status: "error",
          error: "AI service reported ready without video output",
        });
      }

      try {
        const [affectedRows] = await AIVideo.update(
          {
            videoUrl: completedVideoUrl,
            status: "completed",
            meta: data.meta || null,
            transcriptName:
              data.transcript_name || data.text_file || videoJob.transcriptName || null,
          },
          { where: updateWhere },
        );

        if (affectedRows === 0) {
          console.warn("Zero rows updated for ready AIVideo id");
          return res.status(403).json({
            error: "Failed to update status: unauthorized or record not found",
          });
        }
      } catch {
        console.error("Failed to update AIVideo ready result");
        return res.status(500).json({ status: "error", error: "Database update failed" });
      }
    } else if (data.status === "failed") {
      try {
        const [affectedRows] = await AIVideo.update(
          { status: "failed", error: "Video generation failed in AI service" },
          { where: updateWhere },
        );

        if (affectedRows === 0) {
          console.warn("Zero rows updated for failed AIVideo id");
          return res.status(403).json({
            error: "Failed to update status: unauthorized or record not found",
          });
        }
      } catch {
        console.error("Failed to update AIVideo with failure status");
        return res.status(500).json({ status: "error", error: "Database update failed" });
      }
    }

    data.jobId = jobId; // ensure frontend gets our DB id, not python id
    data.transcript_name =
      data.transcript_name || data.text_file || videoJob.transcriptName || null;

    res.json(data);
  } catch {
    console.error("Status proxy error");
    res.status(500).json({ status: "error" });
  }
});

// ----------------------------------------------------
// 3. Proxy Video Stream from Python (The "Middleman")
// ----------------------------------------------------
router.get("/video/:courseId/:filename", protect, async (req, res) => {
  try {
    const { courseId, filename } = req.params;
    const numericCourseId = Number(courseId);

    if (!Number.isInteger(numericCourseId)) {
      return res.status(404).json({ error: "Video not found" });
    }

    // 🔐 The user must be enrolled in the course named in the URL
    const isEnrolled = (req.user.purchasedCourses || []).some(
      (c) => Number(c.courseId) === numericCourseId,
    );

    if (!isEnrolled) {
      return res.status(403).json({ error: "Course not purchased" });
    }

    // 🎯 The AI service names each video "<jobId>.mp4". Only serve a file that
    // belongs to an AIVideo record of *this* course; anything else is a 404.
    if (!filename.endsWith(".mp4")) {
      return res.status(404).json({ error: "Video not found" });
    }

    // The frontend sends <aiVideo.id>.mp4
    const id = filename.slice(0, -".mp4".length);
    const video = await AIVideo.findOne({
      where: { courseId: numericCourseId, id: id },
    });

    if (!video || !video.jobId) {
      return res.status(404).json({ error: "Video not found" });
    }

    // Python service expects <pythonJobId>.mp4
    const pythonFilename = `${video.jobId}.mp4`;
    const pythonVideoUrl = `${process.env.AI_SERVICE_URL}/video-stream/${encodeURIComponent(pythonFilename)}`;
    const requestHeaders = {};
    if (req.headers.range) {
      requestHeaders.Range = req.headers.range;
    }

    const response = await fetch(pythonVideoUrl, {
      headers: requestHeaders,
    });

    if (!response.ok) {
      return res.status(404).json({
        error: "Video not found in AI service",
      });
    }

    const headersToForward = ["content-range", "content-length", "accept-ranges"];

    res.setHeader("Content-Type", "video/mp4");

    for (const header of headersToForward) {
      const value = response.headers.get(header);
      if (value) {
        res.setHeader(header, value);
      }
    }

    res.status(response.status);

    if (!response.body) {
      return res.status(502).json({
        error: "Empty video response from AI service",
      });
    }
    const { Readable } = await import("node:stream");
    Readable.fromWeb(response.body).pipe(res);
  } catch (error) {
    console.error("❌ Proxy Error:", error.message);
    res.status(500).json({
      error: "Failed to load video via proxy",
    });
  }
});

router.post("/explain-code", protect, validate(explainCodeSchema), async (req, res) => {
  try {
    const response = await fetch(`${process.env.AI_SERVICE_URL}/explain-code`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI code explanation failed:", errorText);

      return res.status(502).json({
        message: "AI code explanation service failed",
      });
    }

    const data = await response.json();
    return res.json(data);
  } catch (error) {
    console.error("AI code explanation error:", error);

    return res.status(500).json({
      message: "Unable to explain or debug code right now",
    });
  }
});
// ----------------------------------------------------
// Proxy Voices from Python
// ----------------------------------------------------
router.get("/voices", protect, async (req, res) => {
  try {
    const response = await fetch(`${process.env.AI_SERVICE_URL}/voices`);
    if (!response.ok) throw new Error("Failed to fetch voices");
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("❌ Voices Proxy Error:", error.message);
    res.status(500).json({ error: "Failed to fetch voices" });
  }
});

export default router;
