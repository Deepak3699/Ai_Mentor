"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const migrationName = "20261008190000-add-userId-to-aivideo.cjs";

    const tables = await queryInterface.showAllTables();

    const tableExists = tables.some(
      (table) => (typeof table === "string" ? table : table.tableName).toLowerCase() === "aivideos",
    );

    if (!tableExists) {
      throw new Error("AIVideos table does not exist. Run the application schema setup first.");
    }

    const columns = await queryInterface.describeTable("AIVideos");

    if (!columns.userId) {
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

      await queryInterface.recordOwnership(migrationName, "column", "AIVideos.userId");
    }
  },

  async down(queryInterface) {
    const migrationName = "20261008190000-add-userId-to-aivideo.cjs";

    const tables = await queryInterface.showAllTables();

    const tableExists = tables.some(
      (table) => (typeof table === "string" ? table : table.tableName).toLowerCase() === "aivideos",
    );

    if (!tableExists) return;

    const ownsColumn = await queryInterface.hasOwnership(
      migrationName,
      "column",
      "AIVideos.userId",
    );

    if (ownsColumn) {
      const columns = await queryInterface.describeTable("AIVideos");

      if (columns.userId) {
        await queryInterface.removeColumn("AIVideos", "userId");
      }

      await queryInterface.clearOwnership(migrationName, "column", "AIVideos.userId");
    }
  },
};
