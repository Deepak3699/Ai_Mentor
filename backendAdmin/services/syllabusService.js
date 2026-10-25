import { Module, Lesson } from "../models/index.js";
import { sequelize } from "../config/db.js";
import { getAIServiceHeaders } from "../utils/aiService.js";

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_MODULES = 12;
const MAX_LESSONS_PER_MODULE = 20;
const MAX_TOTAL_LESSONS = 120;
const MAX_TITLE_LENGTH = 120;
const MAX_DURATION_LENGTH = 40;
const LESSON_TYPES = new Set(["video", "article", "quiz", "text"]);

export class SyllabusServiceError extends Error {
  constructor(code, status, retryable = false) {
    super("Syllabus generation is temporarily unavailable");
    this.name = "SyllabusServiceError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

const invalidResponse = () => new SyllabusServiceError("INVALID_PROVIDER_RESPONSE", 502);

const normalizeText = (value, maxLength) => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) return null;
  return normalized;
};

export const validateSyllabusResponse = (payload) => {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.modules)) {
    throw invalidResponse();
  }

  if (payload.modules.length < 1 || payload.modules.length > MAX_MODULES) {
    throw invalidResponse();
  }

  const moduleTitles = new Set();
  let totalLessons = 0;

  const modules = payload.modules.map((module) => {
    if (!module || typeof module !== "object") throw invalidResponse();
    const title = normalizeText(module.title, MAX_TITLE_LENGTH);
    if (!title || !Array.isArray(module.lessons)) throw invalidResponse();
    if (module.lessons.length < 1 || module.lessons.length > MAX_LESSONS_PER_MODULE) {
      throw invalidResponse();
    }

    const moduleKey = title.toLocaleLowerCase("en-US");
    if (moduleTitles.has(moduleKey)) throw invalidResponse();
    moduleTitles.add(moduleKey);
    totalLessons += module.lessons.length;

    const lessonTitles = new Set();
    const lessons = module.lessons.map((lesson) => {
      if (!lesson || typeof lesson !== "object") throw invalidResponse();
      const lessonTitle = normalizeText(lesson.title, MAX_TITLE_LENGTH);
      const duration =
        lesson.duration === undefined
          ? "5 mins"
          : normalizeText(lesson.duration, MAX_DURATION_LENGTH);
      const type = lesson.type === undefined ? "video" : lesson.type;

      if (!lessonTitle || !duration || !LESSON_TYPES.has(type)) {
        throw invalidResponse();
      }

      const lessonKey = lessonTitle.toLocaleLowerCase("en-US");
      if (lessonTitles.has(lessonKey)) throw invalidResponse();
      lessonTitles.add(lessonKey);

      return { title: lessonTitle, duration, type };
    });

    return { title, lessons };
  });

  if (totalLessons > MAX_TOTAL_LESSONS) throw invalidResponse();
  return { modules };
};

export const requestSyllabus = async (
  course,
  {
    fetchImpl = fetch,
    serviceUrl = process.env.AI_SERVICE_URL,
    serviceKey = process.env.AI_SERVICE_KEY,
    timeoutMs = Number(process.env.SYLLABUS_SERVICE_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
    signal,
    shutdownSignal,
  } = {},
) => {
  if (!serviceUrl || !String(serviceUrl).trim()) {
    throw new SyllabusServiceError("SERVICE_CONFIGURATION", 500);
  }

  let headers;
  try {
    headers = getAIServiceHeaders(serviceKey);
  } catch {
    throw new SyllabusServiceError("SERVICE_CONFIGURATION", 500);
  }

  const controller = new AbortController();
  let abortCategory;
  const abortFor = (category) => {
    if (!controller.signal.aborted) {
      abortCategory = category;
      controller.abort();
    }
  };
  const abortForClient = () => abortFor("CLIENT_DISCONNECT");
  const abortForShutdown = () => abortFor("SERVER_SHUTDOWN");

  signal?.addEventListener("abort", abortForClient, { once: true });
  shutdownSignal?.addEventListener("abort", abortForShutdown, { once: true });
  if (signal?.aborted) abortForClient();
  if (shutdownSignal?.aborted) abortForShutdown();

  const effectiveTimeout =
    Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS;
  const timeout = setTimeout(() => abortFor("PROVIDER_TIMEOUT"), effectiveTimeout);

  try {
    const response = await fetchImpl(
      `${String(serviceUrl).replace(/\/+$/, "")}/generate-syllabus`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          course_title: course.title,
          category: course.category,
        }),
        signal: controller.signal,
      },
    );

    if (response.status === 401 || response.status === 403) {
      throw new SyllabusServiceError("PROVIDER_AUTHENTICATION", 502);
    }
    if (response.status >= 500 || response.status === 408 || response.status === 429) {
      throw new SyllabusServiceError("PROVIDER_UNAVAILABLE", 503, true);
    }
    if (!response.ok) {
      throw new SyllabusServiceError("PROVIDER_REQUEST_REJECTED", 502);
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw invalidResponse();
    }
    if (payload?.error) throw invalidResponse();
    return validateSyllabusResponse(payload);
  } catch (error) {
    if (error instanceof SyllabusServiceError) throw error;
    if (abortCategory === "PROVIDER_TIMEOUT") {
      throw new SyllabusServiceError("PROVIDER_TIMEOUT", 503, true);
    }
    if (abortCategory === "CLIENT_DISCONNECT") {
      throw new SyllabusServiceError("CLIENT_DISCONNECT", 499);
    }
    if (abortCategory === "SERVER_SHUTDOWN") {
      throw new SyllabusServiceError("SERVER_SHUTDOWN", 503, true);
    }
    throw new SyllabusServiceError("PROVIDER_UNAVAILABLE", 503, true);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortForClient);
    shutdownSignal?.removeEventListener("abort", abortForShutdown);
  }
};

export const persistSyllabus = async (
  courseId,
  data,
  { database = sequelize, ModuleModel = Module, LessonModel = Lesson } = {},
) =>
  database.transaction(async (transaction) => {
    for (const [moduleIndex, module] of data.modules.entries()) {
      const createdModule = await ModuleModel.create(
        {
          courseId,
          title: module.title,
          order: moduleIndex + 1,
        },
        { transaction },
      );

      for (const [lessonIndex, lesson] of module.lessons.entries()) {
        await LessonModel.create(
          {
            moduleId: createdModule.id,
            title: lesson.title,
            duration: lesson.duration,
            type: lesson.type,
            order: lessonIndex + 1,
          },
          { transaction },
        );
      }
    }
  });
