'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Add column allowing nulls
    await queryInterface.addColumn('AIVideos', 'userId', {
      type: Sequelize.UUID,
      allowNull: true,
    });

    // 2. Backfill policy: Assign existing AIVideos to the oldest superadmin or admin
    // If no admins exist, we'll assign a dummy UUID or just let it be (but that would fail the NOT NULL constraint).
    const [admins] = await queryInterface.sequelize.query(
      `SELECT id FROM "Users" WHERE role IN ('superadmin', 'admin') ORDER BY "createdAt" ASC LIMIT 1;`
    );

    if (admins.length > 0) {
      const adminId = admins[0].id;
      await queryInterface.sequelize.query(
        `UPDATE "AIVideos" SET "userId" = '${adminId}' WHERE "userId" IS NULL;`
      );
    } else {
      // Fallback if no admin exists (e.g., in a fresh dev env with existing videos but no admin)
      // Delete orphaned videos, as they cannot be accessed safely without an owner.
      await queryInterface.sequelize.query(
        `DELETE FROM "AIVideos" WHERE "userId" IS NULL;`
      );
    }

    // 3. Enforce non-nullable constraint
    await queryInterface.changeColumn('AIVideos', 'userId', {
      type: Sequelize.UUID,
      allowNull: false,
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('AIVideos', 'userId');
  }
};
