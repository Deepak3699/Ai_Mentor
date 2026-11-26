"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const migrationName = "20250531000000-create-payment.cjs";

    const tables = await queryInterface.showAllTables();

    const tableExists = tables.some(
      (table) => (typeof table === "string" ? table : table.tableName).toLowerCase() === "payments",
    );

    if (!tableExists) {
      await queryInterface.createTable("Payments", {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true,
          allowNull: false,
        },
        userId: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: "Users", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
        },
        courseId: {
          type: Sequelize.INTEGER,
          allowNull: false,
        },
        courseTitle: {
          type: Sequelize.STRING,
          allowNull: false,
        },
        amount: {
          type: Sequelize.INTEGER,
          allowNull: false,
        },
        currency: {
          type: Sequelize.STRING,
          defaultValue: "inr",
        },
        status: {
          type: Sequelize.ENUM("initiated", "processing", "success", "failed"),
          defaultValue: "initiated",
          allowNull: false,
        },
        idempotencyKey: {
          type: Sequelize.STRING,
          allowNull: false,
        },
        gateway: {
          type: Sequelize.ENUM("stripe", "razorpay"),
          defaultValue: "stripe",
          allowNull: false,
        },
        stripeSessionId: Sequelize.STRING,
        stripePaymentIntentId: Sequelize.STRING,
        razorpayOrderId: Sequelize.STRING,
        razorpayPaymentId: Sequelize.STRING,
        cachedResponse: {
          type: Sequelize.JSONB,
          defaultValue: {},
        },
        cacheExpiresAt: Sequelize.DATE,
        createdAt: {
          type: Sequelize.DATE,
          allowNull: false,
        },
        updatedAt: {
          type: Sequelize.DATE,
          allowNull: false,
        },
      });

      await queryInterface.recordOwnership(migrationName, "table", "Payments");
    }

    const indexes = [
      { name: "payments_user_id", fields: ["userId"] },
      {
        name: "payments_idempotency_key",
        fields: ["idempotencyKey"],
        unique: true,
      },
      { name: "payments_stripe_session_id", fields: ["stripeSessionId"] },
      { name: "payments_razorpay_order_id", fields: ["razorpayOrderId"] },
      { name: "payments_status", fields: ["status"] },
    ];

    const existingIndexes = await queryInterface.showIndex("Payments");

    for (const index of indexes) {
      const equivalentExists = existingIndexes.some((existing) => {
        const existingFields = existing.fields.map((field) => field.attribute || field.name);

        const sameFields =
          existingFields.length === index.fields.length &&
          index.fields.every((field, position) => {
            return field === existingFields[position];
          });

        return sameFields && Boolean(existing.unique) === Boolean(index.unique);
      });

      if (!equivalentExists) {
        await queryInterface.addIndex("Payments", index.fields, {
          name: index.name,
          unique: Boolean(index.unique),
        });

        await queryInterface.recordOwnership(migrationName, "index", index.name);
      }
    }
  },

  async down(queryInterface) {
    const migrationName = "20250531000000-create-payment.cjs";

    const ownsTable = await queryInterface.hasOwnership(migrationName, "table", "Payments");

    if (ownsTable) {
      await queryInterface.dropTable("Payments");

      await queryInterface.clearOwnership(migrationName, "table", "Payments");

      const indexNames = [
        "payments_user_id",
        "payments_idempotency_key",
        "payments_stripe_session_id",
        "payments_razorpay_order_id",
        "payments_status",
      ];

      for (const name of indexNames) {
        await queryInterface.clearOwnership(migrationName, "index", name);
      }

      return;
    }

    const indexes = await queryInterface.showIndex("Payments");

    for (const index of indexes) {
      const owned = await queryInterface.hasOwnership(migrationName, "index", index.name);

      if (owned) {
        await queryInterface.removeIndex("Payments", index.name);

        await queryInterface.clearOwnership(migrationName, "index", index.name);
      }
    }
  },
};
