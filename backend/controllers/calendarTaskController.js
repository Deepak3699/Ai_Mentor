import { CalendarTask } from "../models/modelAssociations.js";
import { AppError, NotFoundError, forwardError } from "../utils/error.js";
import buildLogger from "../utils/logger.js";

const log = buildLogger("CALENDAR");
// @desc Get all calendar tasks for user
// @route GET /api/calendar-tasks
// @access Private
export const getCalendarTasks = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const tasks = await CalendarTask.findAll({
      where: { userId },
      order: [["createdAt", "ASC"]],
    });
    res.status(200).json(tasks);
  } catch (error) {
    log.error({ err: error, reqId: req.id }, "Get calendar tasks error");
    return forwardError(
      next,
      res,
      new AppError(
        "Internal Server Error",
        500,
        "INTERNAL_SERVER_ERROR",
        [],
        error?.message || "Calendar task lookup failed",
      ),
    );
  }
};
// @desc Create a calendar task
// @route POST /api/calendar-tasks
// @access Private
export const createCalendarTask = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { date, text, status } = req.body;
    const task = await CalendarTask.create({
      userId,
      date,
      text,
      status: status || "Upcoming",
    });
    res.status(201).json(task);
  } catch (error) {
    log.error({ err: error, reqId: req.id }, "Create calendar task error");
    return forwardError(
      next,
      res,
      new AppError(
        "Internal Server Error",
        500,
        "INTERNAL_SERVER_ERROR",
        [],
        error?.message || "Calendar task creation failed",
      ),
    );
  }
};
// @desc Update a calendar task
// @route PUT /api/calendar-tasks/:id
// @access Private
export const updateCalendarTask = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { text, status } = req.body;
    const task = await CalendarTask.findOne({ where: { id, userId } });
    if (!task) {
      return forwardError(next, res, new NotFoundError("Task not found"));
    }
    if (text !== undefined) task.text = text;
    if (status !== undefined) task.status = status;
    await task.save();
    res.status(200).json(task);
  } catch (error) {
    log.error({ err: error, reqId: req.id }, "Update calendar task error");
    return forwardError(
      next,
      res,
      new AppError(
        "Internal Server Error",
        500,
        "INTERNAL_SERVER_ERROR",
        [],
        error?.message || "Calendar task update failed",
      ),
    );
  }
};
// @desc Delete a calendar task
// @route DELETE /api/calendar-tasks/:id
// @access Private
export const deleteCalendarTask = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const task = await CalendarTask.findOne({ where: { id, userId } });
    if (!task) {
      return forwardError(next, res, new NotFoundError("Task not found"));
    }
    await task.destroy();
    res.status(200).json({ success: true, message: "Task deleted successfully" });
  } catch (error) {
    log.error({ err: error, reqId: req.id }, "Delete calendar task error");
    return forwardError(
      next,
      res,
      new AppError(
        "Internal Server Error",
        500,
        "INTERNAL_SERVER_ERROR",
        [],
        error?.message || "Calendar task deletion failed",
      ),
    );
  }
};
