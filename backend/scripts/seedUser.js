import dotenv from "dotenv";
import { sequelize } from "../config/db.js";
import User from "../models/User.js";
import bcrypt from "bcrypt";

dotenv.config();

const seedUser = async () => {
  try {
    await sequelize.authenticate();
    // Sync models just in case
    await sequelize.sync();

    const email = "user@aimentor.local";

    let user = await User.findOne({ where: { email } });
    if (!user) {
      user = await User.create({
        firstName: "Demo",
        lastName: "User",
        name: "Demo User",
        email: email,
        password: "UserPassword123!",
        bio: "I am a demo user",
        isProfileComplete: true,
      });
      console.log("✅ Regular User created successfully!");
    } else {
      console.log("⚠️ User already exists!");
    }

    process.exit(0);
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  }
};

seedUser();
