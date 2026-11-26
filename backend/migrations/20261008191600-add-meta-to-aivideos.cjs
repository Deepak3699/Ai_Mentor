"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const migrationName = "20261008191600-add-meta-to-aivideos.cjs";

    const tables = await queryInterface.showAllTables();

    const tableExists = tables.some(
      (table) => (typeof table === "string" ? table : table.tableName).toLowerCase() === "aivideos",
    );

    if (!tableExists) {
      throw new Error("AIVideos table does not exist. Run the application schema setup first.");
    }

    const columns = await queryInterface.describeTable("AIVideos");

    if (!columns.meta) {
      await queryInterface.addColumn("AIVideos", "meta", {
        type: Sequelize.JSON,
        allowNull: true,
      });

      await queryInterface.recordOwnership(migrationName, "column", "AIVideos.meta");
    }
  },

  async down(queryInterface) {
    const migrationName = "20261008191600-add-meta-to-aivideos.cjs";

    const tables = await queryInterface.showAllTables();

    const tableExists = tables.some(
      (table) => (typeof table === "string" ? table : table.tableName).toLowerCase() === "aivideos",
    );

    if (!tableExists) return;

    const ownsColumn = await queryInterface.hasOwnership(migrationName, "column", "AIVideos.meta");

    if (ownsColumn) {
      const columns = await queryInterface.describeTable("AIVideos");

      if (columns.meta) {
        await queryInterface.removeColumn("AIVideos", "meta");
      }

      await queryInterface.clearOwnership(migrationName, "column", "AIVideos.meta");
    }
  },
};
