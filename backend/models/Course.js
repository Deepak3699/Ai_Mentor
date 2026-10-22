import { DataTypes } from "sequelize";
import { sequelize } from "../config/db.js";
import { defineCourse } from "../../packages/shared-models/Course.js";

const Course = defineCourse(sequelize, DataTypes);

export default Course;
