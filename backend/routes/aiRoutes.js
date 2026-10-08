import AIVideo from "../models/AIVideo.js";
import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import validate from "../middleware/validate.js";
import {
  generateVideoSchema,
  generateQuizSchema,
  submitQuizSchema,
} from "../schemas/aiSchema.js";
import { getCourseAndLessonTitles } from "../controllers/courseController.js";
import {
  Course,
  Module,
  Lesson,
  LessonContent,
  QuizSession,
} from "../models/modelAssociations.js";
import Preferences from "../models/Preference.js";
import { videoQueue } from "../queues/videoQueue.js";
import dotenv from "dotenv";
dotenv.config();

const router = express.Router();


const getQuizDifficulty = (quizHistory = []) => {
  if (!quizHistory.length) return "intermediate";

  const recentAttempt = quizHistory[quizHistory.length - 1];
  const score = Number(recentAttempt.score);

  if (!Number.isFinite(score)) return "intermediate";

  if (score < 50) return "beginner";
  if (score <= 80) return "intermediate";
  return "advanced";
};

const getWeakTopics = (quizHistory = []) => {
  return [
    ...new Set(
      quizHistory
        .slice(-3)
        .flatMap((attempt) => Array.isArray(attempt.weakTopics) ? attempt.weakTopics : [])
        .filter(Boolean)
    ),
  ].slice(0, 10);
};

const getPurchasedCourse = (user, courseId) => {
  return (user.purchasedCourses || []).find(
    (course) => Number(course.courseId) === Number(courseId)
  );
};

router.post("/generate-quiz", protect, validate(generateQuizSchema), async (req, res) => {
  try {
    const { courseId, lessonId } = req.body;

    const course = await Course.findByPk(courseId);

    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    if (course.status === "disabled") {
      return res.status(403).json({ message: "This course is currently disabled." });
    }

    if (course.status === "deleted") {
      return res.status(404).json({ message: "Course not found" });
    }

    const purchasedCourse = getPurchasedCourse(req.user, courseId);
    const priceValue = parseFloat(course.priceValue) || 0;
    const isFreeOrOne = priceValue <= 1;

    if (!purchasedCourse && req.user.role !== "admin" && !isFreeOrOne) {
      return res.status(403).json({
        message: "Access denied. Please purchase/enroll in this course.",
      });
    }

    const lesson = await Lesson.findByPk(lessonId, {
      include: [
        {
          model: Module,
          required: true,
          where: {
            courseId: Number(courseId),
          },
        },
        {
          model: LessonContent,
          as: "content",
          required: false,
        },
      ],
    });

    if (!lesson) {
      return res.status(404).json({
        message: "Lesson not found in this course.",
      });
    }

    const quizHistory = purchasedCourse?.progress?.quizHistory || [];

    const difficulty = getQuizDifficulty(quizHistory);
    const weakTopics = getWeakTopics(quizHistory);

    const lessonContent = [
      lesson.title ? `Lesson title: ${lesson.title}` : "",
      lesson.content?.introduction
        ? `Introduction: ${lesson.content.introduction}`
        : "",
      lesson.content?.keyConcepts
        ? `Key concepts: ${JSON.stringify(lesson.content.keyConcepts)}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    if (!lessonContent) {
      return res.status(400).json({
        message: "This lesson does not contain enough content to generate a quiz.",
      });
    }

    const aiResponse = await fetch(
      `${process.env.AI_SERVICE_URL}/generate-quiz`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          lesson: lessonContent,
          difficulty,
          weak_topics: weakTopics,
        }),
      }
    );

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("QUIZ AI SERVICE ERROR:", errorText);

      return res.status(502).json({
        message: "Quiz generation service failed.",
      });
    }

    const quiz = await aiResponse.json();

    if (
      !quiz ||
      !Array.isArray(quiz.questions) ||
      quiz.questions.length !== 4
    ) {
      return res.status(502).json({
        message: "AI service returned an invalid quiz.",
      });
    }

    for (const question of quiz.questions) {
      if (
        !question ||
        typeof question.question !== "string" ||
        !Array.isArray(question.options) ||
        question.options.length !== 4 ||
        !Number.isInteger(question.correct_index) ||
        question.correct_index < 0 ||
        question.correct_index > 3 ||
        typeof question.explanation !== "string" ||
        typeof question.topic !== "string" ||
        !question.topic.trim()
      ) {
        return res.status(502).json({
          message: "AI service returned an invalid quiz question.",
        });
      }
    }

    const quizSession = await QuizSession.create({
      userId: req.user.id,
      courseId: Number(courseId),
      lessonId: Number(lessonId),
      difficulty,
      questions: quiz.questions.map((question) => ({
        question: question.question,
        options: question.options,
        correct_index: question.correct_index,
        explanation: question.explanation,
        topic: question.topic,
      })),
      // Quiz sessions are valid for 30 minutes.
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });

    // Never expose correct answers to the frontend.
    const clientQuiz = {
      quizSessionId: quizSession.id,
      lessonId: Number(lessonId),
      difficulty,
      questions: quiz.questions.map((question) => ({
        question: question.question,
        options: question.options,
        topic: question.topic,
      })),
    };

    return res.json(clientQuiz);
  } catch (error) {
    console.error("GENERATE QUIZ ERROR:", error);

    return res.status(500).json({
      message: "Failed to generate quiz.",
    });
  }
});

router.post("/submit-quiz", protect, validate(submitQuizSchema), async (req, res) => {
  try {
    const { courseId, lessonId, quizSessionId, answers } = req.body;

    const quizSession = await QuizSession.findOne({
      where: {
        id: quizSessionId,
        userId: req.user.id,
        courseId: Number(courseId),
        lessonId: Number(lessonId),
        submittedAt: null,
      },
    });

    if (!quizSession) {
      return res.status(404).json({
        message: "Quiz session not found or already submitted.",
      });
    }

    if (new Date(quizSession.expiresAt).getTime() <= Date.now()) {
      return res.status(410).json({
        message: "Quiz session has expired. Please generate a new quiz.",
      });
    }

    const questions = quizSession.questions;

    if (!Array.isArray(questions) || questions.length !== 4) {
      return res.status(500).json({
        message: "Stored quiz session is invalid.",
      });
    }

    let correctAnswers = 0;
    const weakTopics = [];

    questions.forEach((question, index) => {
      const selectedAnswer = answers[index];

      if (selectedAnswer === question.correct_index) {
        correctAnswers += 1;
      } else if (
        question.topic &&
        !weakTopics.includes(question.topic)
      ) {
        weakTopics.push(question.topic);
      }
    });

    const totalQuestions = questions.length;
    const score = Math.round(
      (correctAnswers / totalQuestions) * 100
    );

    const attempt = {
      lessonId: Number(lessonId),
      score,
      totalQuestions,
      correctAnswers,
      difficulty: quizSession.difficulty,
      weakTopics,
      attemptedAt: new Date().toISOString(),
    };

    /*
     * Save adaptive-learning history for enrolled/purchased users.
     * Free/admin access can still submit quizzes, but without a
     * purchasedCourses progress record there is no history to update.
     */
    const purchasedCourse = getPurchasedCourse(req.user, courseId);

    if (purchasedCourse) {
      const courses = req.user.purchasedCourses || [];
      const courseIndex = courses.findIndex(
        (courseItem) =>
          Number(courseItem.courseId) === Number(courseId)
      );

      if (courseIndex !== -1) {
        const progress = courses[courseIndex].progress || {};

        if (!Array.isArray(progress.quizHistory)) {
          progress.quizHistory = [];
        }

        progress.quizHistory.push(attempt);

        // Keep quiz history manageable.
        progress.quizHistory = progress.quizHistory.slice(-20);

        courses[courseIndex].progress = progress;

        req.user.set("purchasedCourses", courses);
        req.user.changed("purchasedCourses", true);

        await req.user.save();
      }
    }

    // Mark this session as submitted so it cannot be reused.
    quizSession.submittedAt = new Date();
    await quizSession.save();

    return res.json({
      success: true,
      lessonId: Number(lessonId),
      score,
      correctAnswers,
      totalQuestions,
      difficulty: quizSession.difficulty,
      weakTopics,
      results: questions.map((question, index) => ({
        question: question.question,
        selectedAnswer: answers[index],
        correctAnswer: question.correct_index,
        explanation: question.explanation,
        topic: question.topic,
        correct: answers[index] === question.correct_index,
      })),
    });
  } catch (error) {
    console.error("SUBMIT QUIZ ERROR:", error);

    return res.status(500).json({
      message: "Failed to submit quiz.",
    });
  }
});

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
      videoUrl: "",
      transcriptName: "",
      status: "pending",
    });

    // Add to queue
    const job = await videoQueue.add("generate-video", {
      aiVideoId: aiVideo.id,
      courseId,
      lessonId,
      celebrity,
      courseTitle,
      lessonTitle,
      userPreferences,
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