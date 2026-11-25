import dotenv from "dotenv";
import { pathToFileURL } from "url";
import { connectDB, sequelize } from "../config/db.js";
import { User, Course } from "../models/index.js";

dotenv.config();

const ALLOWED_ENVS = ["development", "test"];

const SAMPLE_COURSES = [
  { title: "Mastering React", priceValue: 499, currency: "INR" },
  { title: "Node.js for Backend", priceValue: 699, currency: "INR" },
  { title: "Full‑Stack Web Dev", priceValue: 999, currency: "INR" },
];

// Purchases reference courses by title; ids are resolved at runtime.
const SAMPLE_USERS = [
  {
    name: "Rahul Sharma",
    firstName: "Rahul",
    lastName: "Sharma",
    email: "rahul@example.com",
    role: "user",
    purchases: [
      {
        course: "Mastering React",
        transactionId: "GP-UPI-AXI-2025-0012345678",
        purchaseDate: "2025-01-15",
      },
      {
        course: "Node.js for Backend",
        transactionId: "UTR-2025-02-10-9876543210",
        purchaseDate: "2025-02-10",
      },
    ],
  },
  {
    name: "Priya Mehta",
    firstName: "Priya",
    lastName: "Mehta",
    email: "priya@example.com",
    role: "user",
    purchases: [
      {
        course: "Full‑Stack Web Dev",
        transactionId: "T10F8G6H4J2K1L9M7N5P3R0Q.token.2025-03-05",
        purchaseDate: "2025-03-05",
      },
    ],
  },
  {
    name: "Amit Kumar",
    firstName: "Amit",
    lastName: "Kumar",
    email: "amit@example.com",
    role: "user",
    purchases: [
      {
        course: "Mastering React",
        transactionId: "HDFC-25-03-20-123456789012",
        purchaseDate: "2025-03-20",
      },
    ],
  },
];

export const assertSeedingAllowed = ({
  env = process.env.NODE_ENV,
  remoteDb = Boolean(process.env.NEON_DATABASE_URL),
  allowRemote = process.env.ALLOW_SEED_ON_REMOTE_DB === "true",
} = {}) => {
  if (!ALLOWED_ENVS.includes(env)) {
    throw new Error(
      `Refusing to seed: NODE_ENV is "${env ?? "undefined"}". ` +
        `Allowed environments: ${ALLOWED_ENVS.join(", ")}.`,
    );
  }
  if (remoteDb && !allowRemote) {
    throw new Error(
      "Refusing to seed: NEON_DATABASE_URL points to a remote database. " +
        "Set ALLOW_SEED_ON_REMOTE_DB=true only if it is a disposable dev/test database.",
    );
  }
};
export const seedPaymentData = async ({ dryRun = false, closeConnection = false } = {}) => {
  assertSeedingAllowed(); // runs BEFORE any DB connection

  await connectDB();
  const summary = { coursesCreated: 0, coursesExisting: 0, usersCreated: 0, usersExisting: 0 };

  try {
    await sequelize.transaction(async (transaction) => {
      // ---------- 1. Courses ----------
      const coursesByTitle = {};
      for (const courseData of SAMPLE_COURSES) {
        if (dryRun) {
          const existing = await Course.findOne({
            where: { title: courseData.title },
            transaction,
          });
          existing ? summary.coursesExisting++ : summary.coursesCreated++;
          console.log(
            `[dry-run] course "${courseData.title}": ${existing ? "exists, skip" : "would create"}`,
          );
          coursesByTitle[courseData.title] = existing ?? { id: null, ...courseData };
          continue;
        }
        const [course, created] = await Course.findOrCreate({
          where: { title: courseData.title },
          defaults: courseData,
          transaction,
        });
        coursesByTitle[course.title] = course;
        created ? summary.coursesCreated++ : summary.coursesExisting++;
        if (created) console.log(`Created course: ${course.title}`);
      }

      // ---------- 2. Users with purchases ----------
      for (const { purchases, ...userFields } of SAMPLE_USERS) {
        const purchasedCourses = purchases.map((p) => {
          const course = coursesByTitle[p.course];
          return {
            courseId: course.id,
            courseTitle: course.title,
            amount: course.priceValue,
            currency: course.currency ?? "INR",
            paymentStatus: "paid",
            transactionId: p.transactionId,
            purchaseDate: new Date(p.purchaseDate),
          };
        });

        if (dryRun) {
          const existing = await User.findOne({ where: { email: userFields.email }, transaction });
          existing ? summary.usersExisting++ : summary.usersCreated++;
          console.log(
            `[dry-run] user ${userFields.email}: ${existing ? "exists, skip" : "would create"}`,
          );
          continue;
        }

        // findOrCreate never modifies an existing row, so real data is safe.
        const [user, created] = await User.findOrCreate({
          where: { email: userFields.email },
          defaults: { ...userFields, purchasedCourses },
          transaction,
        });
        created ? summary.usersCreated++ : summary.usersExisting++;
        if (created) console.log(`Created user: ${user.name} (${user.email})`);
      }
    });

    console.log(`${dryRun ? "[dry-run] " : ""}Done.`, summary);
    return summary;
  } finally {
    if (closeConnection) await sequelize.close().catch(() => {});
  }
};

// Run only when executed directly (not when imported by tests)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dryRun = process.argv.includes("--dry-run");
  seedPaymentData({ dryRun, closeConnection: true })
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Failed to seed payment data:", error.message);
      process.exit(1);
    });
}
