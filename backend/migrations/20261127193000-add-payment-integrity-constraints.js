"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.addIndex("Payments", ["userId", "courseId"], {
      name: "payments_success_user_course_unique",
      unique: true,
      where: { status: "success" },
    });
    await queryInterface.addIndex("Payments", ["razorpayOrderId"], {
      name: "payments_razorpay_order_id_unique",
      unique: true,
    });
    await queryInterface.addIndex("Payments", ["razorpayPaymentId"], {
      name: "payments_razorpay_payment_id_unique",
      unique: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("Payments", "payments_razorpay_payment_id_unique");
    await queryInterface.removeIndex("Payments", "payments_razorpay_order_id_unique");
    await queryInterface.removeIndex("Payments", "payments_success_user_course_unique");
  },
};
