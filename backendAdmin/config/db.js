import fs from "fs";
import { Sequelize } from "sequelize";
import dotenv from "dotenv";

dotenv.config();

const isProduction = process.env.NODE_ENV === "production";
const connectionString = process.env.NEON_DATABASE_URL;

const allowInsecureDbSsl =
  !isProduction &&
  process.env.ALLOW_INSECURE_DB_SSL === "true";

if (isProduction && process.env.ALLOW_INSECURE_DB_SSL === "true") {
  throw new Error(
    "Invalid database TLS configuration: ALLOW_INSECURE_DB_SSL cannot be enabled in production."
  );
}

const getCaCertificate = () => {
  if (process.env.DB_SSL_CA) {
    return process.env.DB_SSL_CA.replace(/\\n/g, "\n");
  }

  if (process.env.DB_SSL_CA_FILE) {
    try {
      return fs.readFileSync(process.env.DB_SSL_CA_FILE, "utf8");
    } catch (error) {
  throw new Error(
    `Invalid database TLS configuration: unable to read DB_SSL_CA_FILE (${error.message})`,
    { cause: error }
  );
}
  }

  return undefined;
};

const prepareConnectionString = (urlString) => {
  const url = new URL(urlString);

  const sslMode = url.searchParams.get("sslmode");
  const ca = getCaCertificate();

  if (isProduction && sslMode !== "verify-full") {
    throw new Error(
      'Invalid production database TLS configuration: NEON_DATABASE_URL must use sslmode=verify-full.'
    );
  }

  if (
    !isProduction &&
    !allowInsecureDbSsl &&
    sslMode &&
    sslMode !== "verify-full"
  ) {
    throw new Error(
      'Invalid database TLS configuration: use sslmode=verify-full, or explicitly set ALLOW_INSECURE_DB_SSL=true for development only.'
    );
  }

  url.searchParams.delete("sslmode");
  url.searchParams.delete("sslrootcert");
  url.searchParams.delete("sslcert");
  url.searchParams.delete("sslkey");

  return {
    connectionString: url.toString(),
    ssl: {
      rejectUnauthorized: !allowInsecureDbSsl,
      ...(ca ? { ca } : {}),
    },
  };
};

let sequelize;

if (connectionString) {
  const { connectionString: secureConnectionString, ssl } =
    prepareConnectionString(connectionString);

  sequelize = new Sequelize(secureConnectionString, {
    dialect: "postgres",
    logging: false,
    dialectOptions: {
      ssl,
    },
  });
} else {
  sequelize = new Sequelize(
    process.env.DB_NAME || "upboskills",
    process.env.DB_USER || "postgres",
    process.env.DB_PASSWORD || "",
    {
      host: process.env.DB_HOST || "localhost",
      port: process.env.DB_PORT || 5432,
      dialect: "postgres",
      logging: false,
    }
  );
}

export const connectDB = async () => {
  try {
    await sequelize.authenticate();
    console.log("✅ Database connected successfully.");
  } catch (error) {
    console.error("❌ Database connection failed:", error.message);
    throw error;
  }
};

export { sequelize };