import { askAssistantAI } from "../services/assistantAIService.js";
import { buildUserContext } from "../services/contextBuilder.js";
import User from "../models/User.js";
import Lesson from "../models/Lesson.js";
import Preference from "../models/Preference.js";
import { AppError, forwardError } from "../utils/error.js";
import { detectIntent } from "../services/intentService.js";
import { normalizeHistory } from "../services/chatHistory.js";
import { detectNavigation } from "../services/navigationService.js";
import { APP_ROUTES } from "../services/routeMap.js";

const localizedReply = (res, key, params = {}, extra = {}) =>
  res.json({ replyKey: `assistant.responses.${key}`, replyParams: params, ...extra });

export const getChatContext = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id);

    const preferences = await Preference.findOne({
      where: {
        user_id: user.id,
      },
    });

    return res.json({
      user: {
        name: user.name,
        email: user.email,
      },

      purchasedCourses: user.purchasedCourses || [],

      settings: user.settings || {},

      preferences: preferences || {},
    });
  } catch (error) {
    console.error(error);
    return forwardError(
      next,
      res,
      new AppError(
        "Internal Server Error",
        500,
        "INTERNAL_SERVER_ERROR",
        [],
        error?.message || "Failed to load context",
      ),
    );
  }
};

export const chatWithAssistant = async (req, res, next) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== "string" || !message.trim()) {
      return forwardError(
        next,
        res,
        new AppError("Message is required", 400, "BAD_REQUEST", [], "Message is required"),
      );
    }
    const { turns: history = [], error: historyError } = normalizeHistory(req.body.history);
    if (historyError) {
      return forwardError(
        next,
        res,
        new AppError(historyError, 400, "BAD_REQUEST", [], historyError),
      );
    }

    // Load user and preferences FIRST
    const user = await User.findByPk(req.user.id);

    if (!user) {
      return forwardError(
        next,
        res,
        new AppError("User not found", 404, "NOT_FOUND", [], "User not found"),
      );
    }

    const userName = user.firstName || user.name || "__student__";

    const preferences = await Preference.findOne({
      where: {
        user_id: req.user.id,
      },
    });

    // Detect intent
    const intent = detectIntent(message);

    // Navigation
    if (intent.type === "navigation") {
      return localizedReply(res, "open_route", { route: intent.route }, { route: intent.route });
    }

    // Enrolled Courses
    if (intent.type === "course_info") {
      const courses = user.purchasedCourses || [];

      if (!courses.length) {
        return localizedReply(res, "no_courses");
      }

      const list = courses.map((course, index) => `${index + 1}. ${course.courseTitle}`).join("\n");

      return localizedReply(res, "course_list", { name: userName, courses: list });
    }

    // Preferences
    if (intent.type === "preference_info") {
      if (!preferences) {
        return localizedReply(res, "no_preferences");
      }

      return localizedReply(res, "preferences", {
        goal: preferences.learning_goal || "__unknown__",
        experience: preferences.experience_level || "__unknown__",
        explanation: preferences.explanation_type || "__unknown__",
        style: preferences.learning_style || "__unknown__",
        pace: preferences.teaching_pace || "__unknown__",
        examples: preferences.example_type || "__unknown__",
        focus: preferences.focus_area || "__unknown__",
      });
    }

    // Current lesson and resume navigation
    if (intent.type === "current_lesson") {
      const courses = user.purchasedCourses || [];
      const activeCourse = courses.find((course) => course.progress?.currentLesson);

      if (!activeCourse) {
        return localizedReply(res, "no_active_lesson");
      }

      const savedLesson = activeCourse.progress.currentLesson;
      const lessonId =
        typeof savedLesson === "object" && savedLesson !== null
          ? (savedLesson.lessonId ?? savedLesson.id)
          : null;

      let lessonTitle =
        typeof savedLesson === "object" && savedLesson !== null ? savedLesson.title : null;

      if (lessonId && !lessonTitle) {
        const lesson = await Lesson.findByPk(lessonId);
        lessonTitle = lesson?.title;
      }

      const displayLesson = lessonTitle || lessonId || savedLesson;

      return localizedReply(
        res,
        "current_lesson",
        { lesson: displayLesson, course: activeCourse.courseTitle },
        {
          route: activeCourse.courseId && lessonId ? `/learning/${activeCourse.courseId}` : null,
          lessonId: lessonId || null,
        },
      );
    }
    // Settings
    if (intent.type === "settings_info") {
      return localizedReply(res, "settings", {
        theme: user.settings?.appearance?.theme || "light",
        language: user.settings?.appearance?.language || "en",
      });
    }

    // Progress
    if (intent.type === "progress_info") {
      const courses = user.purchasedCourses || [];

      let completedLessons = 0;
      const courseProgress = [];

      courses.forEach((course) => {
        const completed = course.progress?.completedLessons?.length || 0;

        completedLessons += completed;

        courseProgress.push({ course: course.courseTitle, completedCount: completed });
      });

      return localizedReply(res, "progress", {
        name: userName,
        courseCount: courses.length,
        completedCount: completedLessons,
        courseProgress,
      });
    }

    const detectedRoute = detectNavigation(message);

    if (detectedRoute) {
      return localizedReply(res, "take_you_there", {}, { route: detectedRoute });
    }

    const context = buildUserContext(user, preferences);

    const result = await askAssistantAI({
      context,
      message,
      history,
      requestId: req.id,
    });
    if (!result.ok) {
      return res.json({ route: null, error: result.category });
    }
    const route =
      result.route && Object.values(APP_ROUTES).includes(result.route) ? result.route : null;

    const cleanedReply = result.text.trim();
    return res.json(
      cleanedReply
        ? { reply: cleanedReply, route }
        : {
            replyKey: route
              ? "assistant.responses.take_you_there"
              : "assistant.responses.empty_response",
            route,
          },
    );
  } catch (error) {
    console.error("CHAT ERROR:", error);

    res.status(500).json({
      error: "generic",
    });
  }
};
