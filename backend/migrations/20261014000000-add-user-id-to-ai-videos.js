"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("AIVideos", "userId", {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: "Users",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });

    await queryInterface.addIndex("AIVideos", ["userId"]);
    await queryInterface.addIndex("AIVideos", ["jobId"]);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("AIVideos", ["jobId"]);
    await queryInterface.removeIndex("AIVideos", ["userId"]);
    await queryInterface.removeColumn("AIVideos", "userId");
  },
};