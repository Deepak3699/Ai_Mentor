import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";

const isTestEnvironment = process.env.NODE_ENV === "test";

if (!isTestEnvironment) {
  dotenv.config();
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

export default cloudinary;