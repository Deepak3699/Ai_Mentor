import { User } from "../models/index.js";
import { sendServerError } from "../utils/apiError.js";

export const getAllUsers = async (req, res) => {
  try {
    // page aur limit query se lo
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    // skip calculate karo
    const offset = (page - 1) * limit;

    const { search, status } = req.query;
    const { Op } = await import("sequelize");

    const where = {};

    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
      ];
    }

    if (status && status !== "all") {
      where.status = status;
    }

    const users = await User.findAndCountAll({
      attributes: [
        "id",
        "name",
        "email",
        "role",
        "purchasedCourses",
        "createdAt",
        "status",
        "isBlocked",
      ],
      where,
      limit,
      offset,
      order: [["createdAt", "DESC"]],
    });

    res.status(200).json({
      success: true,
      totalUsers: users.count,
      currentPage: page,
      totalPages: Math.ceil(users.count / limit),
      data: users.rows,
    });
  } catch (error) {
    return sendServerError(req, res, error, "userController.getAllUsers");
  }
};

export const updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["active", "on-hold"].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    user.status = status;
    await user.save();

    res.status(200).json({ success: true, data: user });
  } catch (error) {
    return sendServerError(req, res, error, "userController.updateUserStatus");
  }
};
export const toggleUserBlock = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findByPk(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    user.isBlocked = !user.isBlocked;
    await user.save();

    return res.status(200).json({
      success: true,
      message: user.isBlocked ? "User blocked successfully" : "User unblocked successfully",
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        isBlocked: user.isBlocked,
      },
    });
  } catch (error) {
    return sendServerError(req, res, error, "userController.toggleUserBlock");
  }
};
export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    await user.destroy();
    res.status(200).json({ success: true, message: "User deleted successfully" });
  } catch (error) {
    return sendServerError(req, res, error, "userController.deleteUser");
  }
};
