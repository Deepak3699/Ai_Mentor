import AIVideo from "../models/AIVideo.js";
import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import validate from "../middleware/validate.js";
import { generateVideoSchema } from "../schemas/aiSchema.js";
import { getCourseAndLessonTitles } from "../controllers/courseController.js";
import Preferences from "../models/Preference.js";
import { getVideoQueue } from "../queues/videoQueue.js";
import dotenv from "dotenv";
dotenv.config();

const router = express.Router();

router.post("/generate-video", protect, validate(generateVideoSchema), async (req, res) => {
  try {
    const { courseId, lessonId, celebrity, voice_id, speech_rate, speech_pitch } = req.body;

    // 🔐 Check purchase
    const purchasedCourse = req.user.purchasedCourses.find(
      (c) => Number(c.courseId) === Number(courseId)
    );

    if (!purchasedCourse) {
      return res.status(403).json({ message: "Course not purchased" });
    }

    // 🕵️ Check Cache First
    const cachedVideo = await AIVideo.findOne({
      where: {
        courseId: Number(courseId),
        lessonId: String(lessonId),
        celebrity: String(celebrity).toLowerCase(),
      },
    });

    if (cachedVideo) {
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

      const filename = cachedVideo.videoUrl.split("/").pop();

      const videoCheck = await fetch(
        `${process.env.AI_SERVICE_URL}/video-stream/${filename}`,
        { method: "HEAD" }   // lightweight check
      );

      if (!videoCheck.ok) {
        console.log("⚠️ Cached video missing. Removing from DB...");

        await cachedVideo.destroy();  // delete bad cache

      } else {
        console.log("✅ Cached video verified.");

        return res.json({
          videoUrl: cachedVideo.videoUrl,
          transcriptName: cachedVideo.transcriptName,
          jobId: cachedVideo.jobId,
          cached: true,
        });
      }
    }


    // Get titles from JSON
    const titles = await getCourseAndLessonTitles(courseId, lessonId);

    if (!titles) {
      return res.status(404).json({ message: "Invalid course or lesson" });
    }

    const { courseTitle, lessonTitle } = titles;

    const userPreferencesRecord = await Preferences.findOne({
      where: { user_id: req.user.id }   // 👈 FIX
    });

    const userPreferences = userPreferencesRecord
      ? userPreferencesRecord.toJSON()
      : null;

    // Create DB record immediately as pending
    const aiVideo = await AIVideo.create({
      courseId: Number(courseId),
      lessonId: String(lessonId),
      celebrity: String(celebrity).toLowerCase(),
      userId: req.user.id,
      videoUrl: "",
      transcriptName: "",
      status: "pending",
    });

    // Add to queue
    const videoQueue = getVideoQueue();
    const job = await videoQueue.add("generate-video", {
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
    });

    console.log(`📥 Job added to queue: ${job.id}, DB ID: ${aiVideo.id}`);

    return res.json({
      jobId: aiVideo.id, // Frontend uses DB id to poll
      status: "processing",
      message: "Video generation started",
    });

  } catch (error) {
    console.error("AI GENERATE ERROR:", error);
    res.status(500).json({ message: "Failed to generate AI video" });
  }
});

// ----------------------------------------------------
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

    const isAdmin = req.user.role === "admin" || req.user.role === "superadmin";
    if (!isAdmin && videoJob.userId !== req.user.id) {
      return res.status(403).json({ error: "Access denied" });
    }

    if (videoJob.status === "failed") {
      return res.json({ status: "failed", error: videoJob.error });
    }

    if (videoJob.status === "completed" && videoJob.videoUrl) {
      return res.json({
        status: "ready",
        cloudinary_url: videoJob.videoUrl,
        transcriptName: videoJob.transcriptName,
        jobId: jobId // return same ID to frontend
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

    // 🌥️ If video is ready and Cloudinary URL is available, persist it to DB
    const aiVideo = await AIVideo.findOne({
      where: { jobId: String(jobId) },
      attributes: ["courseId"],
    });

    if (data.status === "ready" && data.local_video_url && aiVideo) {
      const filename = data.local_video_url.split("/").pop();
      data.local_video_url = "/api/ai/video/" + aiVideo.courseId + "/" + filename;
    }

    if (data.status === "ready" && (data.cloudinary_url || data.local_video_url)) {
      try {
        await AIVideo.update(
          { videoUrl: data.cloudinary_url, status: "completed" },
          { where: { id: jobId } }
        );
        console.log(`☁️ AIVideo DB updated with Cloudinary URL for DB ID: ${jobId}`);
      } catch (dbErr) {
        console.error("⚠️ Failed to update AIVideo with Cloudinary URL:", dbErr.message);
      }
    } else if (data.status === "failed") {
        await AIVideo.update(
          { status: "failed", error: "Failed in AI service" },
          { where: { id: jobId } }
        );
    }
    
    data.jobId = jobId; // ensure frontend gets our DB id, not python id

    res.json(data);
  } catch (error) {
    console.error("❌ Status Proxy Error:", error.message);
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
      (c) => Number(c.courseId) === numericCourseId
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
    const pythonVideoUrl =
      `${process.env.AI_SERVICE_URL}/video-stream/${encodeURIComponent(pythonFilename)}`;

    const response = await fetch(pythonVideoUrl);

    if (!response.ok) {
      return res.status(404).json({
        error: "Video not found in AI service",
      });
    }

    res.setHeader("Content-Type", "video/mp4");
    // Streams the response body directly to the client
    const reader = response.body.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();

  } catch (error) {
    console.error("❌ Proxy Error:", error.message);
    res.status(500).json({
      error: "Failed to load video via proxy",
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
