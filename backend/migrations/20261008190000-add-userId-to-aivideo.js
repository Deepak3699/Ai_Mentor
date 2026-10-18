"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Nullable-legacy strategy:
    // Existing production records remain preserved with userId = NULL, avoiding false provenance
    // (not assigned to oldest administrator) and preventing destructive deletion when no admin exists.
    // Future generated video records persist the authenticated requesting user's ID.
    //
    // Referential integrity policy:
    // Adds a foreign key constraint referencing "Users"("id") with ON DELETE SET NULL and ON UPDATE CASCADE.
    // When a user account is deleted, generated course videos remain available as shared cached
    // course content for other enrolled learners, safely transitioning the record to legacy/ownerless state.
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
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn("AIVideos", "userId");
  },
};
