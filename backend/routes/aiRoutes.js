import AIVideo from "../models/AIVideo.js";
import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import validate from "../middleware/validate.js";
import { generateVideoSchema, explainCodeSchema } from "../schemas/aiSchema.js";
import { getCourseAndLessonTitles } from "../controllers/courseController.js";
import Preferences from "../models/Preference.js";
import { getVideoQueue } from "../queues/videoQueue.js";
import { Op } from "sequelize";
import dotenv from "dotenv";
dotenv.config();

const router = express.Router();

const hasCourseAccess = (user, courseId) => {
  if (!user) return false;
  if (user.role === "admin" || user.role === "superadmin") return true;
  return (user.purchasedCourses || []).some(
    (course) => Number(course.courseId) === Number(courseId),
  );
};

router.post("/generate-video", protect, validate(generateVideoSchema), async (req, res) => {
  let aiVideo;

  try {
    const { courseId, lessonId, celebrity, voice_id, speech_rate, speech_pitch } = req.body;

    if (!hasCourseAccess(req.user, courseId)) {
      return res.status(403).json({
        success: false,
        error: { code: "FORBIDDEN", message: "Course not purchased", details: [] },
      });
    }

    const key = {
      courseId: Number(courseId),
      lessonId: Number(lessonId),
      celebrity: String(celebrity).toLowerCase(),
    };

    const sendProcessing = (record, message = "Video generation is already in progress") =>
      res.json({
        jobId: record.id,
        status: "processing",
        message,
      });

    const resetVideoFields = {
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

    // Never delete or replace a record whose generation is in progress.
    if (aiVideo && ["pending", "processing"].includes(aiVideo.status)) {
      return sendProcessing(aiVideo);
    }

    // Return a valid completed Cloudinary cache immediately.
    if (aiVideo?.status === "completed" && aiVideo.videoUrl) {
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
        return res.json({
          videoUrl: aiVideo.videoUrl,
          transcriptName: aiVideo.transcriptName,
          jobId: aiVideo.jobId,
          meta: aiVideo.meta,
          cached: true,
        });
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
            return res.json({
              videoUrl: aiVideo.videoUrl,
              transcriptName: aiVideo.transcriptName,
              jobId: aiVideo.jobId,
              meta: aiVideo.meta,
              cached: true,
            });
          }
        } catch (error) {
          console.warn("Cached video verification failed:", error.message);
        }
      }
    }

    const titles = await getCourseAndLessonTitles(courseId, lessonId);

    if (!titles) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Invalid course or lesson", details: [] },
      });
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
          success: false,
          error: {
            code: "CONFLICT",
            message: "Video generation state changed. Please retry.",
            details: [],
          },
        });
      }
    } else {
      try {
        aiVideo = await AIVideo.create({
          ...key,
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

        if (["pending", "processing"].includes(aiVideo.status)) {
          return sendProcessing(aiVideo);
        }

        if (aiVideo.status === "completed" && aiVideo.videoUrl) {
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
            return res.json({
              videoUrl: aiVideo.videoUrl,
              transcriptName: aiVideo.transcriptName,
              jobId: aiVideo.jobId,
              meta: aiVideo.meta,
              cached: true,
            });
          }

          return sendProcessing(aiVideo, "An existing video record was found");
        }

        const claimed = await claimExistingVideo(aiVideo);

        if (!claimed) {
          if (["pending", "processing"].includes(aiVideo.status)) {
            return sendProcessing(aiVideo);
          }

          return res.status(409).json({
            success: false,
            error: {
              code: "CONFLICT",
              message: "Video generation state changed. Please retry.",
              details: [],
            },
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
      await aiVideo.update({
        status: "failed",
        error: queueError.message,
      });

      throw queueError;
    }
  } catch (error) {
    console.error("AI GENERATE ERROR:", error);
    return res.status(500).json({
      success: false,
      error: { code: "INTERNAL_SERVER_ERROR", message: "Internal Server Error", details: [] },
    });
  }
});

// Proxy Transcript Content from Python
// ----------------------------------------------------
router.get("/transcript/:filename", protect, async (req, res) => {
  try {
    const { filename } = req.params;

    // Check DB record to enforce course access
    const cachedVideo = await AIVideo.findOne({
      where: { transcriptName: filename },
    });

    if (!cachedVideo) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Transcript not found", details: [] },
      });
    }

    if (!hasCourseAccess(req.user, cachedVideo.courseId)) {
      return res.status(403).json({
        success: false,
        error: { code: "FORBIDDEN", message: "Course not purchased", details: [] },
      });
    }

    if (cachedVideo.transcript) {
      if (process.env.NODE_ENV !== "test") {
        console.log("[AI] Serving cached transcript for:", filename);
      }
      return res.json({ content: cachedVideo.transcript });
    }

    const pythonTranscriptUrl = `${process.env.AI_SERVICE_URL}/transcript/${filename}`;
    const response = await fetch(pythonTranscriptUrl);

    if (!response.ok) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Transcript not found", details: [] },
      });
    }

    const data = await response.json();

    // Save to Cache
    cachedVideo.transcript = data.content;
    await cachedVideo.save();
    if (process.env.NODE_ENV !== "test") {
      console.log("[AI] Transcript cached for:", filename);
    }

    res.json(data);
  } catch (error) {
    if (process.env.NODE_ENV !== "test") {
      console.error("[AI] Transcript Proxy Error:", error.message);
    }
    return res.status(500).json({
      success: false,
      error: { code: "INTERNAL_SERVER_ERROR", message: "Internal Server Error", details: [] },
    });
  }
});

router.get("/status/:jobId", protect, async (req, res) => {
  try {
    const { jobId } = req.params; // This is now aiVideo.id

    // Check DB first
    const videoJob = await AIVideo.findOne({ where: { id: jobId } });

    if (!videoJob) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Video job not found", details: [] },
      });
    }

    // Enforce course entitlement before returning video status or URLs
    if (!hasCourseAccess(req.user, videoJob.courseId)) {
      return res.status(403).json({
        success: false,
        error: { code: "FORBIDDEN", message: "Course not purchased", details: [] },
      });
    }

    // Enforce course entitlement before returning video status or URLs
    if (!hasCourseAccess(req.user, videoJob.courseId)) {
      return res.status(403).json({
        success: false,
        error: { code: "FORBIDDEN", message: "Course not purchased", details: [] },
      });
    }

    if (videoJob.status === "failed") {
      return res.json({ status: "failed", error: videoJob.error });
    }

    if (videoJob.status === "completed" && videoJob.videoUrl) {
      return res.json({
        status: "ready",
        cloudinary_url: videoJob.videoUrl,
        transcriptName: videoJob.transcriptName,
        jobId: jobId, // return same ID to frontend
        meta: videoJob.meta,
      });
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

    // Persist ready results by the database record ID. The Python job ID is only
    // used for polling the AI service and must never be used as the DB identity.
    if (data.status === "ready" && data.local_video_url) {
      data.local_video_url = `/api/ai/video/${videoJob.courseId}/${jobId}.mp4`;
    }

    if (data.status === "ready" && (data.cloudinary_url || data.local_video_url)) {
      try {
        await videoJob.update({
          videoUrl: data.cloudinary_url || data.local_video_url,
          status: "completed",
          meta: data.meta,
          transcriptName: data.transcript_name || data.text_file || videoJob.transcriptName,
        });
        console.log(`☁️ AIVideo DB updated for DB ID: ${jobId}`);
      } catch (dbErr) {
        console.error("⚠️ Failed to update AIVideo ready result:", dbErr.message);
      }
    } else if (data.status === "failed") {
      await AIVideo.update(
        { status: "failed", error: "Failed in AI service" },
        { where: { id: jobId } },
      );
    }

    data.jobId = jobId; // ensure frontend gets our DB id, not python id
    data.transcript_name =
      data.transcript_name || data.text_file || videoJob.transcriptName || null;

    res.json(data);
  } catch (error) {
    console.error("❌ Status Proxy Error:", error.message);
    return res.status(500).json({
      success: false,
      error: { code: "INTERNAL_SERVER_ERROR", message: "Internal Server Error", details: [] },
    });
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
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Video not found", details: [] },
      });
    }

    // 🔐 The user must be enrolled in the course named in the URL (or admin)
    if (!hasCourseAccess(req.user, numericCourseId)) {
      return res.status(403).json({
        success: false,
        error: { code: "FORBIDDEN", message: "Course not purchased", details: [] },
      });
    }

    // 🎯 The AI service names each video "<jobId>.mp4". Only serve a file that
    // belongs to an AIVideo record of *this* course; anything else is a 404.
    if (!filename.endsWith(".mp4")) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Video not found", details: [] },
      });
    }

    // The frontend sends <aiVideo.id>.mp4
    const id = filename.slice(0, -".mp4".length);
    const video = await AIVideo.findOne({
      where: { courseId: numericCourseId, id: id },
    });

    if (!video || !video.jobId) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Video not found", details: [] },
      });
    }

    // Python service expects &lt;pythonJobId&gt;.mp4
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
        success: false,
        error: { code: "NOT_FOUND", message: "Video not found in AI service", details: [] },
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
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Empty video response from AI service",
          details: [],
        },
      });
    }
    const { Readable } = await import("node:stream");
    Readable.fromWeb(response.body).pipe(res);
  } catch (error) {
    console.error("❌ Proxy Error:", error.message);
    return res.status(500).json({
      success: false,
      error: { code: "INTERNAL_SERVER_ERROR", message: "Internal Server Error", details: [] },
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
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "AI code explanation service failed",
          details: [],
        },
      });
    }

    const data = await response.json();
    return res.json(data);
  } catch (error) {
    console.error("AI code explanation error:", error);

    return res.status(500).json({
      success: false,
      error: { code: "INTERNAL_SERVER_ERROR", message: "Internal Server Error", details: [] },
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
    return res.status(500).json({
      success: false,
      error: { code: "INTERNAL_SERVER_ERROR", message: "Internal Server Error", details: [] },
    });
  }
});

export default router;
