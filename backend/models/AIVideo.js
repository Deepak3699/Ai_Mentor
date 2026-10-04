import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/db.js";

class AIVideo extends Model { }

AIVideo.init(
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        courseId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        lessonId: {
            type: DataTypes.INTEGER,
            allowNull: false,
             references: {
        model: "Lessons",
        key: "id",
    },
        },
        celebrity: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        userId: {
            type: DataTypes.UUID,
            allowNull: true,
        },
        videoUrl: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        transcript: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        transcriptName: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        jobId: {
            type: DataTypes.STRING,
            allowNull: true,
        },
    },
    {
        sequelize,
        modelName: "AIVideo",
        timestamps: true,
        indexes: [
            {
                unique: true,
                fields: ["courseId", "lessonId", "celebrity"],
            },
        ],
    }
);

export default AIVideo;
