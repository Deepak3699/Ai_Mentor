import { createRequire } from "node:module";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Umzug, SequelizeStorage } from "umzug";
import { DataTypes, QueryTypes } from "sequelize";
import { sequelize, connectDB } from "../config/db.js";

const require = createRequire(import.meta.url);
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(currentDir, "../migrations");

const queryInterface = sequelize.getQueryInterface();
const ownershipTable = "MigrationOwnership";

const migrationNames = [
  "20250531000000-create-payment.cjs",
  "20261008190000-add-userId-to-aivideo.cjs",
  "20261008191600-add-meta-to-aivideos.cjs",
];

async function ensureOwnershipTable() {
  const tables = await queryInterface.showAllTables();

  const exists = tables.some(
    (table) =>
      (typeof table === "string" ? table : table.tableName).toLowerCase() ===
      ownershipTable.toLowerCase(),
  );

  if (!exists) {
    await queryInterface.createTable(ownershipTable, {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
      },
      migrationName: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      objectType: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      objectName: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
    });
  }
}

async function recordOwnership(migrationName, objectType, objectName) {
  const rows = await sequelize.query(
    `SELECT id FROM "${ownershipTable}"
     WHERE "migrationName" = :migrationName
     AND "objectType" = :objectType
     AND "objectName" = :objectName LIMIT 1`,
    {
      replacements: { migrationName, objectType, objectName },
      type: QueryTypes.SELECT,
    },
  );

  if (rows.length === 0) {
    await queryInterface.bulkInsert(ownershipTable, [
      {
        id: randomUUID(),
        migrationName,
        objectType,
        objectName,
        createdAt: new Date(),
      },
    ]);
  }
}

async function hasOwnership(migrationName, objectType, objectName) {
  const rows = await sequelize.query(
    `SELECT id FROM "${ownershipTable}"
     WHERE "migrationName" = :migrationName
     AND "objectType" = :objectType
     AND "objectName" = :objectName LIMIT 1`,
    {
      replacements: { migrationName, objectType, objectName },
      type: QueryTypes.SELECT,
    },
  );

  return rows.length > 0;
}

async function clearOwnership(migrationName, objectType, objectName) {
  await queryInterface.bulkDelete(ownershipTable, {
    migrationName,
    objectType,
    objectName,
  });
}

queryInterface.recordOwnership = recordOwnership;
queryInterface.hasOwnership = hasOwnership;
queryInterface.clearOwnership = clearOwnership;

const umzug = new Umzug({
  migrations: {
    glob: `${migrationsDir.replace(/\\/g, "/")}/*.cjs`,
    resolve: ({ name, path: migrationPath, context }) => {
      const migration = require(migrationPath);

      return {
        name,
        up: async () => migration.up(context, sequelize.constructor),
        down: async () => migration.down(context, sequelize.constructor),
      };
    },
  },
  context: queryInterface,
  storage: new SequelizeStorage({ sequelize }),
  logger: console,
});

async function showStatus() {
  const executed = await umzug.executed();
  const pending = await umzug.pending();

  console.log("\nMigration Status:\n");

  for (const migration of executed) {
    console.log(`[DONE] ${migration.name}`);
  }

  for (const migration of pending) {
    console.log(`[PENDING] ${migration.name}`);
  }

  if (executed.length === 0 && pending.length === 0) {
    console.log("No migrations found.");
  }
}

async function baseline() {
  const tables = await queryInterface.showAllTables();

  const tableNames = tables.map((table) =>
    (typeof table === "string" ? table : table.tableName).toLowerCase(),
  );

  if (!tableNames.includes("payments") || !tableNames.includes("aivideos")) {
    throw new Error("Baseline failed: Payments and AIVideos tables must already exist.");
  }

  const payments = await queryInterface.describeTable("Payments");
  const aiVideos = await queryInterface.describeTable("AIVideos");

  const requiredPayments = [
    "id",
    "userId",
    "courseId",
    "courseTitle",
    "amount",
    "status",
    "idempotencyKey",
    "gateway",
    "createdAt",
    "updatedAt",
  ];

  const requiredAIVideos = ["id", "userId", "meta", "createdAt", "updatedAt"];

  for (const column of requiredPayments) {
    if (!payments[column]) {
      throw new Error(`Baseline failed: Payments.${column} is missing.`);
    }
  }

  for (const column of requiredAIVideos) {
    if (!aiVideos[column]) {
      throw new Error(`Baseline failed: AIVideos.${column} is missing.`);
    }
  }

  const executed = await umzug.executed();
  const executedNames = new Set(executed.map((migration) => migration.name));

  for (const name of migrationNames) {
    if (!executedNames.has(name)) {
      await umzug.storage.logMigration({ name });
      console.log(`[BASELINED] ${name}`);
    }
  }

  console.log("\nBaseline completed successfully.");
}

async function main() {
  const command = process.argv[2];

  if (!["up", "down", "status", "baseline"].includes(command)) {
    throw new Error("Usage: node scripts/migrate.js <up|down|status|baseline>");
  }

  await connectDB();

  try {
    if (command === "up") {
      await ensureOwnershipTable();
      await umzug.up();
      console.log("Migrations completed.");
    } else if (command === "down") {
      await ensureOwnershipTable();

      const executedMigrations = await umzug.executed();

      const lastMigration = executedMigrations
        .filter(({ name }) => migrationNames.includes(name))
        .sort((a, b) => a.name.localeCompare(b.name))
        .at(-1);

      if (!lastMigration) {
        console.log("No migrations to undo.");
        return;
      }

      await umzug.down({ migrations: [lastMigration.name] });

      console.log(`Reverted ${lastMigration.name}.`);
    } else if (command === "baseline") {
      await baseline();
    } else {
      await showStatus();
    }
  } finally {
    await sequelize.close();
  }
}

main().catch((error) => {
  console.error("Migration error:", error);
  process.exitCode = 1;
});
