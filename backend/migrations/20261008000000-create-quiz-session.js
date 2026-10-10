"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("QuizSessions", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      userId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "Users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      courseId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      lessonId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      difficulty: {
        type: Sequelize.ENUM("beginner", "intermediate", "advanced"),
        allowNull: false,
      },
      questions: {
        type: Sequelize.JSONB,
        allowNull: false,
      },
      expiresAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      submittedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });

    await queryInterface.addIndex("QuizSessions", ["userId"]);
    await queryInterface.addIndex("QuizSessions", ["courseId", "lessonId"]);
    await queryInterface.addIndex("QuizSessions", ["expiresAt"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("QuizSessions");
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_QuizSessions_difficulty";'
    );
  },
};
