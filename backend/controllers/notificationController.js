import Notification from "../models/Notification.js";
import { AppError, NotFoundError, forwardError } from "../utils/error.js";

// @desc    Get user notifications
// @route   GET /api/notifications
// @access  Private
export const getUnreadCount = async (req, res, next) => {
  try {
    const count = await Notification.count({
      where: {
        userId: req.user.id,
        unread: true,
      },
    });

    res.status(200).json({ count });
  } catch (error) {
    return forwardError(
      next,
      res,
      new AppError(
        "Internal Server Error",
        500,
        "INTERNAL_SERVER_ERROR",
        [],
        error?.message || "Notification count lookup failed",
      ),
    );
  }
};

export const getNotifications = async (req, res, next) => {
  try {
    const notifications = await Notification.findAll({
      where: { userId: req.user.id },
      order: [["createdAt", "DESC"]],
      limit: 50,
    });

    res.status(200).json(notifications);
  } catch (error) {
    return forwardError(
      next,
      res,
      new AppError(
        "Internal Server Error",
        500,
        "INTERNAL_SERVER_ERROR",
        [],
        error?.message || "Notification lookup failed",
      ),
    );
  }
};

// @desc    Mark notification as read
// @route   PATCH /api/notifications/:id/read
// @access  Private
export const markAsRead = async (req, res, next) => {
  try {
    const notification = await Notification.findOne({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (!notification) {
      return forwardError(next, res, new NotFoundError("Notification not found"));
    }

    notification.unread = false;
    await notification.save();

    res.status(200).json(notification);
  } catch (error) {
    return forwardError(
      next,
      res,
      new AppError(
        "Internal Server Error",
        500,
        "INTERNAL_SERVER_ERROR",
        [],
        error?.message || "Notification update failed",
      ),
    );
  }
};

// @desc    Mark all notifications as read
// @route   PATCH /api/notifications/read-all
// @access  Private
export const markAllAsRead = async (req, res, next) => {
  try {
    await Notification.update({ unread: false }, { where: { userId: req.user.id, unread: true } });

    res.status(200).json({ message: "All notifications marked as read" });
  } catch (error) {
    return forwardError(
      next,
      res,
      new AppError(
        "Internal Server Error",
        500,
        "INTERNAL_SERVER_ERROR",
        [],
        error?.message || "Bulk notification update failed",
      ),
    );
  }
};

// @desc    Clear all notifications
// @route   DELETE /api/notifications/clear
// @access  Private
export const clearAll = async (req, res, next) => {
  try {
    await Notification.destroy({
      where: { userId: req.user.id },
    });

    res.status(200).json({ message: "All notifications cleared" });
  } catch (error) {
    return forwardError(
      next,
      res,
      new AppError(
        "Internal Server Error",
        500,
        "INTERNAL_SERVER_ERROR",
        [],
        error?.message || "Notification clear failed",
      ),
    );
  }
};

/**
 * Utility function to create a notification
 * Can be used from other controllers
 */
export const createNotification = async (
  userId,
  { title, message, type, metadata = null, transaction } = {},
) => {
  try {
    const options = transaction ? { transaction } : {};

    const notification = await Notification.create(
      {
        userId,
        title,
        message,
        type,
        metadata,
      },
      options,
    );

    return notification;
  } catch (error) {
    console.error("Error creating notification:", error.message);

    if (transaction) {
      throw error;
    }

    return null;
  }
};
