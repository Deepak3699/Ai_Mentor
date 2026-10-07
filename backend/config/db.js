import fs from "fs";
import { Sequelize } from "sequelize";
import dotenv from "dotenv";

const isTestEnvironment = process.env.NODE_ENV === "test";
const isProduction = process.env.NODE_ENV === "production";

if (!isTestEnvironment) {
  dotenv.config();
}

// Tests use inert local metadata and never inherit production database settings.
const connectionString = isTestEnvironment ? null : process.env.NEON_DATABASE_URL;

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
      "Invalid production database TLS configuration: NEON_DATABASE_URL must use sslmode=verify-full."
    );
  }

  if (
    !isProduction &&
    !allowInsecureDbSsl &&
    sslMode &&
    sslMode !== "verify-full"
  ) {
    throw new Error(
      "Invalid database TLS configuration: use sslmode=verify-full, or explicitly set ALLOW_INSECURE_DB_SSL=true for development only."
    );
  }

  // Configure TLS explicitly below.
  // Remove connection-string SSL options so they cannot override
  // dialectOptions.ssl.
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

if (isTestEnvironment) {
  sequelize = new Sequelize("ai_mentor_test", "test_user", "test_password", {
    host: "127.0.0.1",
    port: 5432,
    dialect: "postgres",
    logging: false,
  });
} else if (connectionString) {
  const {
    connectionString: secureConnectionString,
    ssl,
  } = prepareConnectionString(connectionString);

  sequelize = new Sequelize(secureConnectionString, {
    dialect: "postgres",
    logging: false,
    pool: {
      max: parseInt(process.env.DB_POOL_MAX, 10) || 5,
      min: parseInt(process.env.DB_POOL_MIN, 10) || 0,
      acquire: parseInt(process.env.DB_POOL_ACQUIRE, 10) || 30000,
      idle: parseInt(process.env.DB_POOL_IDLE, 10) || 10000,
    },
    dialectOptions: {
      ssl,
    },
  });
} else {
  // Local development PostgreSQL.
  // This branch is used only when NEON_DATABASE_URL is not configured.
  sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
      host: process.env.DB_HOST || "localhost",
      port: process.env.DB_PORT || 5432,
      dialect: "postgres",
      logging: false,
    }
  );
}

async function connectDB() {
  try {
    await sequelize.authenticate();
    console.log("✅ Database connected successfully.");
  } catch (error) {
    console.error("❌ Database connection failed:", error.message);
    throw error;
  }
}

export { sequelize, connectDB };
export default connectDB;