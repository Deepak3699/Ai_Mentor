# Environment and Dependency Matrix

This document provides a consolidated reference for environment variables, dependencies, prerequisites, service ports, and local development setup across all AI Mentor services.

## 1. Application Services

The project contains five independently runnable services:

| Service             | Directory             | Technology       | Default Port |
| ------------------- | --------------------- | ---------------- | -----------: |
| Student Backend API | `backend/`            | Node.js, Express |         5000 |
| Student Frontend    | `frontend/`           | React, Vite      |         5173 |
| Admin Backend API   | `backendAdmin/`       | Node.js, Express |         5001 |
| Admin Frontend      | `frontendAdmin/`      | React, Vite      |         5174 |
| AI Service          | `ai_service/backend/` | Python, FastAPI  |         8000 |

The two backend services use PostgreSQL. They can use the same Neon database when configured with the same connection URL.

The root development runner coordinates service startup.

## 2. Environment File Locations

Create local environment files from the corresponding examples:

| Service          | Example File                      | Local Environment File    |
| ---------------- | --------------------------------- | ------------------------- |
| Student Backend  | `backend/.env.example`            | `backend/.env`            |
| Student Frontend | `frontend/.env.example`           | `frontend/.env`           |
| Admin Backend    | `backendAdmin/.env.example`       | `backendAdmin/.env`       |
| Admin Frontend   | `frontendAdmin/.env.example`      | `frontendAdmin/.env`      |
| AI Service       | `ai_service/backend/.env.example` | `ai_service/backend/.env` |

Do not commit real `.env` files or expose credentials in source code.

## 3. Environment Variable Matrix

### 3.1 Student Backend

**Directory:** `backend/`

**Example file:** `backend/.env.example`

| Variable                     | Purpose                                            | Requirement                          |
| ---------------------------- | -------------------------------------------------- | ------------------------------------ |
| `PORT`                       | Backend server port; default is 5000               | Optional                             |
| `NEON_DATABASE_URL`          | PostgreSQL/Neon connection URL                     | Required                             |
| `JWT_SECRET`                 | Authentication token signing secret                | Required                             |
| `FRONTEND_URL`               | Student frontend origin for CORS                   | Required                             |
| `AI_SERVICE_URL`             | AI service address                                 | Feature-dependent                    |
| `LOG_LEVEL`                  | Logging level                                      | Optional                             |
| `DB_SSL_CA`                  | Custom database CA certificate                     | Optional                             |
| `DB_SSL_CA_FILE`             | Path to custom CA certificate                      | Optional                             |
| `ALLOW_INSECURE_DB_SSL`      | Allows insecure SSL in development only            | Optional                             |
| `DB_POOL_MAX`                | Maximum database connections                       | Optional                             |
| `DB_POOL_MIN`                | Minimum database connections                       | Optional                             |
| `DB_POOL_ACQUIRE`            | Connection acquisition timeout                     | Optional                             |
| `DB_POOL_IDLE`               | Idle connection timeout                            | Optional                             |
| `USE_REDIS_RATE_LIMIT`       | Enables Redis-based rate limiting                  | Optional                             |
| `REDIS_URL`                  | Redis connection URL                               | Optional                             |
| `REDIS_HOST`                 | Redis hostname                                     | Optional                             |
| `REDIS_PORT`                 | Redis port                                         | Optional                             |
| `AI_RATE_LIMIT_WINDOW_MS`    | AI rate-limit window                               | Optional                             |
| `AI_RATE_LIMIT_MAX_REQUESTS` | Maximum requests per window                        | Optional                             |
| `AI_RATE_LIMIT_SHARED_QUOTA` | Enables shared AI rate-limit quota                 | Optional                             |
| `CLOUDINARY_CLOUD_NAME`      | Cloudinary cloud name                              | Required unless disabled             |
| `CLOUDINARY_API_KEY`         | Cloudinary API key                                 | Required unless disabled             |
| `CLOUDINARY_API_SECRET`      | Cloudinary API secret                              | Required unless disabled             |
| `DISABLE_CLOUDINARY`         | Disables Cloudinary integration when set to `true` | Optional                             |
| `SMTP_HOST`                  | SMTP server hostname                               | Required unless email is disabled    |
| `SMTP_PORT`                  | SMTP server port                                   | Required unless email is disabled    |
| `SMTP_USER`                  | SMTP username                                      | Required unless email is disabled    |
| `SMTP_PASS`                  | SMTP password/app password                         | Required unless email is disabled    |
| `FROM_EMAIL`                 | Sender email address                               | Required unless email is disabled    |
| `FROM_NAME`                  | Sender display name                                | Required unless email is disabled    |
| `DISABLE_EMAIL`              | Disables email integration when set to `true`      | Optional                             |
| `STRIPE_SECRET_KEY`          | Stripe secret key                                  | Required unless Stripe is disabled   |
| `STRIPE_WEBHOOK_SECRET`      | Stripe webhook signing secret                      | Required unless Stripe is disabled   |
| `DISABLE_STRIPE`             | Disables Stripe when set to `true`                 | Optional                             |
| `RAZORPAY_KEY_ID`            | Razorpay key ID                                    | Required unless Razorpay is disabled |
| `RAZORPAY_KEY_SECRET`        | Razorpay secret                                    | Required unless Razorpay is disabled |
| `DISABLE_RAZORPAY`           | Disables Razorpay when set to `true`               | Optional                             |
| `FIREBASE_PROJECT_ID`        | Firebase Admin project ID                          | Feature-dependent                    |
| `FIREBASE_CLIENT_EMAIL`      | Firebase service account email                     | Feature-dependent                    |
| `FIREBASE_PRIVATE_KEY`       | Firebase service account private key               | Feature-dependent                    |
| `SUPER_ADMIN_EMAIL`          | Super Admin email                                  | Setup/seed-dependent                 |
| `SUPER_ADMIN_NAME`           | Super Admin name                                   | Setup/seed-dependent                 |
| `SUPER_ADMIN_PASSWORD`       | Super Admin password                               | Setup/seed-dependent                 |

The backend environment validator checks database, authentication, frontend URL, and enabled integrations.

When an integration is not configured, its corresponding disable flag can be set to `true`. These flags must use the exact string `true`.

In development, missing or placeholder values produce warnings. In production, validation failures can stop server startup.

### 3.2 Student Frontend

**Directory:** `frontend/`

**Example file:** `frontend/.env.example`

| Variable                            | Purpose                        | Requirement       |
| ----------------------------------- | ------------------------------ | ----------------- |
| `VITE_API_BASE_URL`                 | Student Backend API URL        | Required          |
| `VITE_FIREBASE_API_KEY`             | Firebase Web API key           | Required          |
| `VITE_FIREBASE_AUTH_DOMAIN`         | Firebase authentication domain | Required          |
| `VITE_FIREBASE_PROJECT_ID`          | Firebase project ID            | Required          |
| `VITE_FIREBASE_STORAGE_BUCKET`      | Firebase storage bucket        | Required          |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID   | Required          |
| `VITE_FIREBASE_APP_ID`              | Firebase application ID        | Required          |
| `VITE_STRIPE_PUBLISHABLE_KEY`       | Stripe client-side key         | Feature-dependent |
| `VITE_RAZORPAY_KEY_ID`              | Razorpay client-side key       | Feature-dependent |

The frontend environment validator requires the API URL and all six Firebase Web configuration values.

The default student backend URL is:

`http://localhost:5000`

**Security:** Variables prefixed with `VITE_` are exposed to the browser. Never place private API keys, database passwords, JWT secrets, or service account private keys in frontend environment files.

### 3.3 Admin Backend

**Directory:** `backendAdmin/`

**Example file:** `backendAdmin/.env.example`

| Variable                      | Purpose                                                                                                | Requirement                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| `PORT`                        | Admin API port; default is 5001                                                                        | Optional                                        |
| `FRONTEND_ADMIN_URL`          | Admin frontend origin                                                                                  | Optional; has a default                         |
| `JWT_SECRET`                  | Authentication token signing secret                                                                    | Required for secure authentication              |
| `NEON_DATABASE_URL`           | Neon PostgreSQL connection URL                                                                         | Optional if local DB is configured              |
| `DB_HOST`                     | Local PostgreSQL hostname                                                                              | Local DB fallback                               |
| `DB_PORT`                     | Local PostgreSQL port                                                                                  | Local DB fallback                               |
| `DB_NAME`                     | Local database name                                                                                    | Local DB fallback                               |
| `DB_USER`                     | Local database username                                                                                | Local DB fallback                               |
| `DB_PASSWORD`                 | Local database password                                                                                | Local DB fallback                               |
| `DB_SSL_CA`                   | Custom database CA certificate                                                                         | Optional                                        |
| `DB_SSL_CA_FILE`              | Path to custom CA certificate                                                                          | Optional                                        |
| `ALLOW_INSECURE_DB_SSL`       | Development-only insecure SSL option                                                                   | Optional                                        |
| `DB_POOL_MAX`                 | Maximum database connections                                                                           | Optional                                        |
| `DB_POOL_MIN`                 | Minimum database connections                                                                           | Optional                                        |
| `DB_POOL_ACQUIRE`             | Connection acquisition timeout                                                                         | Optional                                        |
| `DB_POOL_IDLE`                | Idle connection timeout                                                                                | Optional                                        |
| `AI_SERVICE_URL`              | AI service URL for syllabus generation                                                                 | Required for syllabus feature                   |
| `AI_SERVICE_KEY`              | Key sent by Admin Backend in the `x-service-key` header; the AI Service currently does not validate it | Required by Admin Backend for syllabus requests |
| `SYLLABUS_SERVICE_TIMEOUT_MS` | Syllabus request timeout                                                                               | Optional                                        |
| `SUPER_ADMIN_NAME`            | Super Admin display name                                                                               | Required when seeding                           |
| `SUPER_ADMIN_EMAIL`           | Super Admin email                                                                                      | Required when seeding                           |
| `SUPER_ADMIN_PASSWORD`        | Super Admin password                                                                                   | Required when seeding                           |

The Admin Backend connects to the database before starting its HTTP server.

If `NEON_DATABASE_URL` is configured, it takes precedence over local PostgreSQL settings. Otherwise, the local database configuration is used.

The Super Admin variables are required when running the Super Admin seed script, not for ordinary server startup.

Configure a strong `JWT_SECRET`. Do not rely on fallback secrets.

### 3.4 Admin Frontend

**Directory:** `frontendAdmin/`

**Example file:** `frontendAdmin/.env.example`

| Variable            | Purpose               | Requirement            |
| ------------------- | --------------------- | ---------------------- |
| `VITE_API_BASE_URL` | Admin Backend API URL | Required for API proxy |

The Admin Frontend uses Vite's development proxy to forward `/api` requests to the configured backend URL.

The expected local value is:

`VITE_API_BASE_URL=http://localhost:5001`

The Admin Backend runs on port `5001`, not `5000`.

### 3.5 AI Service

**Directory:** `ai_service/backend/`

**Example file:** `ai_service/backend/.env.example`

| Variable                | Purpose                    | Requirement                              |
| ----------------------- | -------------------------- | ---------------------------------------- |
| `GEMINI_API_KEY`        | Google Gemini API key      | Required                                 |
| `GEMINI_MODEL`          | Gemini model name          | Optional; defaults to `gemini-2.5-flash` |
| `LLM_TIMEOUT_SECONDS`   | LLM request timeout        | Optional; defaults to 60                 |
| `GROQ_API_KEY`          | Groq fallback provider key | Optional                                 |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name      | Optional                                 |
| `CLOUDINARY_API_KEY`    | Cloudinary API key         | Optional                                 |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret      | Optional                                 |
| `DID_API_KEY`           | D-ID API key               | Optional                                 |
| `DID_API_URL`           | D-ID API endpoint          | Optional; has a default                  |
| `DID_SOURCE_URL`        | Public avatar image URL    | Feature-dependent                        |

The AI service requires `GEMINI_API_KEY` during configuration validation.

Groq is enabled when its API key is provided. Cloudinary integration is enabled only when all three Cloudinary values are configured.

D-ID settings are used for the related avatar/video functionality.

## 4. Shared Configuration

| Configuration      | Student Backend                    | Admin Backend | Student Frontend   | Admin Frontend    | AI Service           |
| ------------------ | ---------------------------------- | ------------- | ------------------ | ----------------- | -------------------- |
| PostgreSQL/Neon    | Yes                                | Yes           | No                 | No                | No                   |
| JWT authentication | Yes                                | Yes           | Uses backend APIs  | Uses backend APIs | No                   |
| AI service URL     | Yes                                | Yes           | No                 | No                | Own service          |
| Firebase           | Admin SDK configuration where used | No            | Firebase Web SDK   | No                | No                   |
| Cloudinary         | Yes                                | No            | No                 | No                | Optional             |
| Redis              | Optional rate limiting/jobs        | No            | No                 | No                | Video job dependency |
| Stripe/Razorpay    | Payment integrations               | No            | Public/client keys | No                | No                   |

Use the same database URL for both backend services when they are intended to share the same platform database.

The Admin Backend's local PostgreSQL fallback is available when Neon is not configured.

## 5. System Prerequisites

The following tools are needed for the complete development setup:

| Tool               | Recommended Version / Requirement                                            | Purpose                      |
| ------------------ | ---------------------------------------------------------------------------- | ---------------------------- |
| Node.js            | 20.19+ or 22.12+                                                             | Node services and Vite       |
| npm                | Bundled with Node.js                                                         | Dependency installation      |
| Python             | 3.11                                                                         | AI service and tests         |
| FFmpeg             | Installed and available in PATH                                              | AI audio/video processing    |
| Git                | Recent version                                                               | Source control               |
| PostgreSQL or Neon | Working database connection                                                  | Backend persistence          |
| Redis or Memurai   | Required for queued video jobs; other Redis features depend on configuration | Job queues and rate limiting |

The CI workflow uses Node.js 20 and Python 3.11.

The root installer checks that Node.js, npm, Python, and FFmpeg are available. It does not enforce exact version numbers.

## 6. Dependency Installation

The repository contains five npm projects:

- Root project
- Student Backend
- Student Frontend
- Admin Backend
- Admin Frontend

The AI service has a separate Python requirements file.

### Complete setup

From the repository root:

```bash
npm run setup
```

This script:

1. Checks required development tools.
2. Installs npm dependencies for the root and four application projects.
3. Creates or reuses the AI service virtual environment.
4. Installs Python packages from `ai_service/backend/requirements.txt`.
5. Validates the AI service environment and Gemini key.
6. Checks required Python imports.

The setup script expects the AI environment file at:

`ai_service/backend/.env`

and requires a valid `GEMINI_API_KEY`.

### AI-only setup

```bash
npm run setup:ai
```

This installs the AI service Python dependencies without installing all npm projects.

The installer still checks its required system tools.

## 7. Running Services

Run commands from the repository root.

### Start all services

```bash
npm run dev
```

### Start individual services

| Command                      | Service          |
| ---------------------------- | ---------------- |
| `npm run dev:backend`        | Student Backend  |
| `npm run dev:frontend`       | Student Frontend |
| `npm run dev:backend-admin`  | Admin Backend    |
| `npm run dev:frontend-admin` | Admin Frontend   |
| `npm run dev:ai`             | AI Service       |

### Start application groups

Start all five services:

```bash
npm run dev
```

Start both Admin services:

```bash
npm run dev:admin
```

There is no separate student-only group command. To start student services individually, use `npm run dev:backend` and `npm run dev:frontend`.

### Default service URLs

| Service          | URL                     |
| ---------------- | ----------------------- |
| Student Backend  | `http://localhost:5000` |
| Student Frontend | `http://localhost:5173` |
| Admin Backend    | `http://localhost:5001` |
| Admin Frontend   | `http://localhost:5174` |
| AI Service       | `http://127.0.0.1:8000` |

Backend health endpoints:

- Student Backend: `http://localhost:5000/health`
- Admin Backend: `http://localhost:5001/health`
- AI Service: `http://127.0.0.1:8000/`

## 8. Dependency and Startup Matrix

| Service          | Node.js                     | Python | Database | Redis                          | FFmpeg                        | External API            |
| ---------------- | --------------------------- | ------ | -------- | ------------------------------ | ----------------------------- | ----------------------- |
| Student Backend  | Yes                         | No     | Required | Feature-dependent              | No                            | Feature-dependent       |
| Student Frontend | Yes                         | No     | No       | No                             | No                            | Firebase                |
| Admin Backend    | Yes                         | No     | Required | No                             | No                            | AI service for syllabus |
| Admin Frontend   | Yes                         | No     | No       | No                             | No                            | Admin Backend           |
| AI Service       | No for standalone execution | Yes    | No       | Required for queued video jobs | Required for media processing | Gemini                  |

The root installer requires Node.js, npm, Python, and FFmpeg for the complete setup workflow.

The installer does not create a PostgreSQL database or verify database connectivity. Configure and verify the database separately.

## 9. Minimum Working Configuration

For local development, configure the following before starting the relevant services:

| Service          | Minimum configuration                                               |
| ---------------- | ------------------------------------------------------------------- |
| Student Backend  | Valid database URL, JWT secret, student frontend URL                |
| Student Frontend | Backend URL and all six Firebase Web configuration values           |
| Admin Backend    | Working Neon or local PostgreSQL connection and a strong JWT secret |
| Admin Frontend   | Admin Backend URL on port 5001                                      |
| AI Service       | Valid Gemini API key                                                |

Additional integrations require their own credentials.

For example, payment, email, Cloudinary, and avatar/video features may need additional configuration.

The student backend supports disabling optional integrations through its documented `DISABLE_*` flags. Configure those flags explicitly when the related credentials are not available.

## 10. Common Setup Issues

| Problem                                        | Possible Cause                                                            | Resolution                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `npm run setup` cannot find Node.js            | Node.js is not installed or not in PATH                                   | Install a supported Node.js version and reopen the terminal                      |
| Python dependency installation fails           | Python or pip is unavailable                                              | Verify Python installation and virtual environment                               |
| FFmpeg not found                               | FFmpeg is missing from PATH                                               | Install FFmpeg and verify `ffmpeg -version`                                      |
| AI service reports missing Gemini key          | AI `.env` file is missing or key is invalid                               | Configure `ai_service/backend/.env`                                              |
| Backend cannot connect to database             | Incorrect URL, credentials, or SSL configuration                          | Verify the database URL and SSL settings                                         |
| Admin dashboard API requests fail              | Admin frontend points to the wrong backend port                           | Set `VITE_API_BASE_URL=http://localhost:5001`                                    |
| Student frontend Firebase initialization fails | One or more Firebase variables are missing                                | Configure all six Firebase Web values                                            |
| Payment configuration validation fails         | Payment credentials are missing while integration is enabled              | Configure valid keys or set the corresponding disable flag                       |
| Email integration validation fails             | SMTP configuration is missing while email is enabled                      | Configure SMTP values or set `DISABLE_EMAIL=true`                                |
| Cloudinary configuration validation fails      | One or more Cloudinary credentials are missing                            | Configure all three values or set `DISABLE_CLOUDINARY=true`                      |
| Queued video jobs do not work                  | Redis or Memurai is unavailable                                           | Start a Redis-compatible service and configure its connection                    |
| Syllabus generation fails                      | AI service URL is unavailable or the Admin Backend service key is missing | Configure `AI_SERVICE_URL` and `AI_SERVICE_KEY` in the Admin Backend environment |

## 11. Security Guidelines

- Never commit `.env` files containing real credentials.
- Keep `.env.example` files limited to placeholders and safe defaults.
- Never expose backend secrets through frontend `VITE_` variables.
- Use strong, unique JWT secrets.
- Use valid database SSL configuration in production.
- Do not enable insecure database SSL in production.
- Restrict access to service-to-service credentials.
- Rotate credentials if they are accidentally exposed.
- Do not include real API keys in logs, screenshots, issues, or pull requests.

## 12. Related Documentation

- [Initial Setup Guide](../initalSetup.md)
- [Project README](../README.md)
- [AI Lesson Generation Flow](./AI_LESSON_GENERATION_FLOW.md)
- [AI Lesson Video Architecture](./AI_LESSON_VIDEO_ARCHITECTURE.md)
- [Product Flow](./product-flow.md)

For exact dependency versions, refer to each service's `package.json`, lockfile, and the AI service's `requirements.txt`.

For environment variable names and safe example values, refer to the corresponding `.env.example` files.
