import { Op } from "sequelize";
import { sequelize } from "../config/db.js";
import User from "../models/User.js";
import { createNotification } from "./notificationController.js";
import AdminNotification from "../models/AdminNotification.js";
import CourseReport from "../models/CourseReport.js";

// Roles that moderate course reports. These are the User.role enum values in
// backend/models/User.js ("superadmin" is lowercase there, as in
// communityController and sidebarController). The separate Admin table
// (issue #116) is not queried here.
export const MODERATOR_ROLES = ["admin", "superadmin"];

// AdminNotifications.message is a VARCHAR(255) column.
const DASHBOARD_MESSAGE_MAX_LENGTH = 255;

const truncate = (text, max) => (text.length > max ? `${text.slice(0, max - 3)}...` : text);

// @desc    Submit a course report and notify every moderator
// @route   POST /api/course-reports
// @access  Private
//
// The report, the per-moderator notifications and the admin dashboard
// notification are written in a single transaction: either all of them are
// persisted or none are. On any failure the request answers 500 with nothing
// saved, so the client can safely retry without creating a duplicate report.
export const createReport = async (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({
      success: false,
      error: { code: "UNAUTHORIZED", message: "User not authenticated", details: [] },
    });
  }

  const { reportType, subType, description, courseName, email, phone } = req.body;

  try {
    const report = await sequelize.transaction(async (transaction) => {
      const created = await CourseReport.create(
        {
          userId: req.user.id,
          reportType,
          subType,
          description,
          courseName: courseName || null,
          email: email || null,
          phone: phone || null,
        },
        { transaction },
      );

      const moderators = await User.findAll({
        where: { role: { [Op.in]: MODERATOR_ROLES } },
        attributes: ["id"],
        transaction,
      });

      const reporterName = req.user.name || "A user";
      const subTypeLabel = subType ? ` (${subType})` : "";
      const courseLabel = courseName ? ` for course "${courseName}"` : "";
      const descriptionLabel = description
        ? `: "${description.slice(0, 100)}${description.length > 100 ? "..." : ""}"`
        : "";
      const message = `${reporterName} reported a course issue${courseLabel}${subTypeLabel}${descriptionLabel}`;

      for (const moderator of moderators) {
        // With a transaction, createNotification rethrows instead of swallowing.
        await createNotification(moderator.id, {
          title: "Course Report Submitted",
          message,
          type: "security",
          metadata: {
            reportId: created.id,
            reportType,
            subType,
            courseName,
          },
          transaction,
        });
      }

      await AdminNotification.create(
        {
          title: "Course Report Submitted",
          message: truncate(message, DASHBOARD_MESSAGE_MAX_LENGTH),
          type: "report",
        },
        { transaction },
      );

      return created;
    });

    return res.status(201).json(report);
  } catch (err) {
    console.error("Course report submission failed, nothing was saved:", err);
    return res.status(500).json({
      success: false,
      error: { code: "INTERNAL_SERVER_ERROR", message: "Internal Server Error", details: [] },
    });
  }
};
