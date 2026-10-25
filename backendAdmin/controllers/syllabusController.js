import { Course } from "../models/index.js";
import {
  persistSyllabus,
  requestSyllabus,
  SyllabusServiceError,
} from "../services/syllabusService.js";

const logSyllabusFailure = (req, code) => {
  console.error(
    JSON.stringify({
      level: "error",
      requestId: req.id,
      context: "syllabusController.generate",
      method: req.method,
      route: req.originalUrl.split("?")[0],
      adminId: req.admin?.id,
      errorCode: code,
    }),
  );
};

export const generateCourseSyllabus = async (req, res) => {
  const controller = new AbortController();
  const abortOnDisconnect = () => {
    if (!res.writableEnded) controller.abort();
  };
  req.on("aborted", abortOnDisconnect);
  res.on("close", abortOnDisconnect);

  try {
    const course = await Course.findByPk(req.params.id);
    if (!course) return res.status(404).json({ message: "Course not found" });

    let data;
    try {
      data = await requestSyllabus(course, {
        signal: controller.signal,
        shutdownSignal: req.app.locals.shutdownSignal,
      });
    } catch (error) {
      if (error instanceof SyllabusServiceError) {
        if (error.code === "CLIENT_DISCONNECT") return;
        logSyllabusFailure(req, error.code);
        return res.status(error.status).json({
          success: false,
          retryable: error.retryable,
          code: error.code,
          message: "Syllabus generation is temporarily unavailable",
          requestId: req.id,
        });
      }
      if (controller.signal.aborted) return;
      throw error;
    }

    if (controller.signal.aborted) return;
    await persistSyllabus(course.id, data);

    return res.json({ message: "Syllabus generated successfully", data });
  } catch {
    logSyllabusFailure(req, "PERSISTENCE_FAILURE");
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      requestId: req.id,
    });
  } finally {
    req.off("aborted", abortOnDisconnect);
    res.off("close", abortOnDisconnect);
  }
};
