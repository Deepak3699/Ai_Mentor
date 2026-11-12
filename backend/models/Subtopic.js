import { DataTypes } from "sequelize";
import { sequelize } from "../config/db.js";
import Lesson from "./Lesson.js";

const Subtopic = sequelize.define("Subtopic", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  goal: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  topics: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  tools: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  activities: {
    type: DataTypes.JSON,
    allowNull: true,
  },
});

Lesson.hasMany(Subtopic, { foreignKey: "lessonId", onDelete: "CASCADE" });
Subtopic.belongsTo(Lesson, { foreignKey: "lessonId" });

export default Subtopic;