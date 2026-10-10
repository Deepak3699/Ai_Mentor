import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/db.js";

class QuizSession extends Model {}

QuizSession.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "Users",
        key: "id",
      },
    },

    courseId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    lessonId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    difficulty: {
      type: DataTypes.ENUM("beginner", "intermediate", "advanced"),
      allowNull: false,
    },

    questions: {
      type: DataTypes.JSONB,
      allowNull: false,
    },

    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },

    submittedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: "QuizSession",
    tableName: "QuizSessions",
    timestamps: true,
    indexes: [
      { fields: ["userId"] },
      { fields: ["courseId", "lessonId"] },
      { fields: ["expiresAt"] },
    ],
  }
);

export default QuizSession;
