import Notification from "../models/Notification.js";
import { sendServerError, describeError } from "../utils/apiError.js";

// @desc    Get unread notification count
// @route   GET /api/notifications/unread-count
// @access  Private
export const getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.count({
      where: {
        userId: req.user.id,
        unread: true,
      },
    });

    res.status(200).json({ count });
  } catch (error) {
    return sendServerError(req, res, error, "notificationController.getUnreadCount");
  }
};

export const getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.findAll({
      where: { userId: req.user.id },
      order: [["createdAt", "DESC"]],
      limit: 50,
    });

    res.status(200).json(notifications);
  } catch (error) {
    return sendServerError(req, res, error, "notificationController.getNotifications");
  }
};

// @desc    Mark notification as read
// @route   PATCH /api/notifications/:id/read
// @access  Private
export const markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findOne({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    notification.unread = false;
    await notification.save();

    res.status(200).json(notification);
  } catch (error) {
    return sendServerError(req, res, error, "notificationController.markAsRead");
  }
};

// @desc    Mark all notifications as read
// @route   PATCH /api/notifications/read-all
// @access  Private
export const markAllAsRead = async (req, res) => {
  try {
    await Notification.update({ unread: false }, { where: { userId: req.user.id, unread: true } });

    res.status(200).json({ message: "All notifications marked as read" });
  } catch (error) {
    return sendServerError(req, res, error, "notificationController.markAllAsRead");
  }
};

// @desc    Clear all notifications
// @route   DELETE /api/notifications/clear
// @access  Private
export const clearAll = async (req, res) => {
  try {
    await Notification.destroy({
      where: { userId: req.user.id },
    });

    res.status(200).json({ message: "All notifications cleared" });
  } catch (error) {
    return sendServerError(req, res, error, "notificationController.clearAll");
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
    console.error("Error creating notification:", JSON.stringify(describeError(error)));

    if (transaction) {
      throw error;
    }

    return null;
  }
};
