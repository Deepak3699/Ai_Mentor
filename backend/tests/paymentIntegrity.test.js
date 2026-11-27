import { test } from "node:test";
import assert from "node:assert/strict";
import { DataTypes, Sequelize, UniqueConstraintError } from "sequelize";

process.env.NODE_ENV = "test";

const { default: Payment } = await import("../models/Payment.js");

const integrityIndexNames = [
  "payments_success_user_course_unique",
  "payments_razorpay_order_id_unique",
  "payments_razorpay_payment_id_unique",
];

test("payment model indexes prevent concurrent successful purchases and reused Razorpay IDs", async (t) => {
  const database = new Sequelize({
    dialect: "sqlite",
    storage: ":memory:",
    logging: false,
  });
  t.after(() => database.close());

  const PaymentProbe = database.define(
    "PaymentIntegrityProbe",
    {
      userId: { type: DataTypes.STRING, allowNull: false },
      courseId: { type: DataTypes.INTEGER, allowNull: false },
      status: { type: DataTypes.STRING, allowNull: false },
      razorpayOrderId: DataTypes.STRING,
      razorpayPaymentId: DataTypes.STRING,
    },
    {
      tableName: "PaymentIntegrityProbe",
      timestamps: false,
      indexes: Payment.options.indexes.filter((index) => integrityIndexNames.includes(index.name)),
    },
  );

  await database.sync({ force: true });

  const concurrentCreates = await Promise.allSettled([
    PaymentProbe.create({ userId: "user-1", courseId: 7, status: "success" }),
    PaymentProbe.create({ userId: "user-1", courseId: 7, status: "success" }),
  ]);
  assert.equal(concurrentCreates.filter((result) => result.status === "fulfilled").length, 1);
  const rejectedCreate = concurrentCreates.find((result) => result.status === "rejected");
  assert.ok(rejectedCreate.reason instanceof UniqueConstraintError);

  await PaymentProbe.create({ userId: "user-1", courseId: 7, status: "failed" });
  await PaymentProbe.create({ userId: "user-1", courseId: 7, status: "processing" });
  await PaymentProbe.create({ userId: "user-2", courseId: 7, status: "success" });

  await PaymentProbe.create({
    userId: "user-3",
    courseId: 8,
    status: "processing",
    razorpayOrderId: "order-1",
  });
  await assert.rejects(
    PaymentProbe.create({
      userId: "user-4",
      courseId: 9,
      status: "processing",
      razorpayOrderId: "order-1",
    }),
    UniqueConstraintError,
  );

  await PaymentProbe.create({
    userId: "user-5",
    courseId: 10,
    status: "processing",
    razorpayPaymentId: "payment-1",
  });
  await assert.rejects(
    PaymentProbe.create({
      userId: "user-6",
      courseId: 11,
      status: "processing",
      razorpayPaymentId: "payment-1",
    }),
    UniqueConstraintError,
  );
});
