import { Course, Module, Lesson } from "../models/index.js";
import {
  requestSyllabus,
  SyllabusServiceError,
} from "../services/syllabusService.js";

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
      data = await requestSyllabus(course, { signal: controller.signal });
    } catch (error) {
      if (error instanceof SyllabusServiceError) {
        return res.status(503).json({
          success: false,
          retryable: true,
          message: error.message,
        });
      }
      if (controller.signal.aborted) return;
      throw error;
    }

    for (const [moduleIndex, mod] of data.modules.entries()) {
      const newModule = await Module.create({
        courseId: course.id,
        title: mod.title,
        order: moduleIndex + 1,
      });

      for (const [lessonIndex, lesson] of (mod.lessons || []).entries()) {
        await Lesson.create({
          moduleId: newModule.id,
          title: lesson.title,
          duration: lesson.duration || "5 mins",
          type: lesson.type || "video",
          order: lessonIndex + 1,
        });
      }
    }

    return res.json({ message: "Syllabus generated successfully", data });
  } catch (error) {
    console.error("GENERATE SYLLABUS ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Server Error" });
  } finally {
    req.off("aborted", abortOnDisconnect);
    res.off("close", abortOnDisconnect);
  }
};
