import Preference from "../models/Preference.js";
import { AppError, BadRequestError, NotFoundError, forwardError } from "../utils/error.js";

// @desc Get user preferences
// @route GET /api/preferences
export const getPreferences = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const preferences = await Preference.findOne({ where: { user_id: userId } });

    if (!preferences) {
      return res.status(200).json(null);
    }

    res.status(200).json(preferences);
  } catch (error) {
    console.error("GET PREFERENCES ERROR:", error);
    return forwardError(
      next,
      res,
      new AppError(
        "Internal Server Error",
        500,
        "INTERNAL_SERVER_ERROR",
        [],
        error?.message || "Preference lookup failed",
      ),
    );
  }
};

// @desc Create user preferences
// @route POST /api/preferences
export const createPreferences = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Check if preferences already exist for this user
    const existing = await Preference.findOne({ where: { user_id: userId } });
    if (existing) {
      return forwardError(next, res, new BadRequestError("Preferences already exist"));
    }

    const { explanation_type, learning_style, teaching_pace, example_type, focus_area } = req.body;

    // Validate required fields
    if (!explanation_type || !learning_style || !teaching_pace || !example_type || !focus_area) {
      return forwardError(next, res, new BadRequestError("All required fields must be provided"));
    }

    const preferences = await Preference.create({
      user_id: userId,
      explanation_type,
      learning_style,
      teaching_pace,
      example_type,
      focus_area,
    });

    res.status(201).json(preferences);
  } catch (error) {
    console.error("CREATE PREFERENCES ERROR:", error);
    return forwardError(
      next,
      res,
      new AppError(
        "Internal Server Error",
        500,
        "INTERNAL_SERVER_ERROR",
        [],
        error?.message || "Preference creation failed",
      ),
    );
  }
};

// @desc Update user preferences
// @route PUT /api/preferences
export const updatePreferences = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const preferences = await Preference.findOne({ where: { user_id: userId } });

    if (!preferences) {
      return forwardError(next, res, new NotFoundError("Preferences not found"));
    }

    const { explanation_type, learning_style, teaching_pace, example_type, focus_area } = req.body;

    // Validate required fields
    if (!explanation_type || !learning_style || !teaching_pace || !example_type || !focus_area) {
      return forwardError(next, res, new BadRequestError("All required fields must be provided"));
    }

    preferences.explanation_type = explanation_type;
    preferences.learning_style = learning_style;
    preferences.teaching_pace = teaching_pace;
    preferences.example_type = example_type;
    preferences.focus_area = focus_area;

    await preferences.save();

    res.status(200).json(preferences);
  } catch (error) {
    console.error("UPDATE PREFERENCES ERROR:", error);
    return forwardError(
      next,
      res,
      new AppError(
        "Internal Server Error",
        500,
        "INTERNAL_SERVER_ERROR",
        [],
        error?.message || "Preference update failed",
      ),
    );
  }
};
