import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/db.js";

class FlashcardDeck extends Model {}

FlashcardDeck.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "Users", key: "id" },
    },
    courseId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "Courses", key: "id" },
    },
    lessonId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "Lessons", key: "id" },
    },
    cards: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
  },
  {
    sequelize,
    modelName: "FlashcardDeck",
    tableName: "FlashcardDecks",
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ["userId", "courseId", "lessonId"],
      },
    ],
  },
);

export default FlashcardDeck;
