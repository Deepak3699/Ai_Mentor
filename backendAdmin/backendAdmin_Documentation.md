# AI Mentor — Backend Admin Documentation

## Introduction
The `backendAdmin` module is an isolated Express.js management service running on Node.js. It acts as the dedicated administrative API for the *AI Mentor* platform, providing course management, user management, discussion moderation, enrollment and payment analytics, notification management, and content reporting.

---

## Architecture Overview

```text
┌────────────────────────────────────────────────────────┐
│                   Admin Dashboard UI                   │
│               (React Frontend Admin App)               │
└───────────────────────────┬────────────────────────────┘
                            │ (Secure Admin Routes)
                            ▼
┌────────────────────────────────────────────────────────┐
│                Express.js Admin Server                 │
│       (server.js ──> Routes ──> Zod Validations)       │
└───────────────────────────┬────────────────────────────┘
                            │
            ┌───────────────┴───────────────┐
            ▼                               ▼
┌───────────────────────┐       ┌───────────────────────┐
│   Admin Controllers   │       │   Helper Scripts &    │
│  (Data Modification)  │       │   Schema Alterations  │
└───────────┬───────────┘       └───────────┬───────────┘
            │                               │
            ▼                               ▼
┌───────────────────────┐               ┌───────────┐
│   Sequelize Models    │──────────────>│ PostgreSQL│
│ (Alterations/Status)  │               │ (Neon DB) │
└───────────────────────┘               └───────────┘
```
---

## Folder Structure

```text
backendAdmin/
├── config/                  # Database connections & Sequelize management instances
├── controllers/             # Action managers (course CRUD, user status, moderation)
├── middleware/              # Permission checks, logging, and error-handling pipelines
├── models/                  # Core schemas for Admin, Course, User, Notification, etc.
├── routes/                  # Declared endpoint pathways for administrative use
├── schemas/                 # Zod payload structures ensuring zero corrupt data entries
├── scripts/                 # Automation protocols (superadmin seeding)
├── tests/                   # Automated test suites
├── .env.example             # Blueprints for setting local environmental scope variables
├── server.js                # Microservice initialization gateway entry point
└── package.json             # Service metadata and dependencies manifest
```
---


## Tech Stack

| Layer | Technology | Description |
| :--- | :--- | :--- |
| **Runtime Environment** | Node.js | Server-side execution environment |
| **Framework** | Express.js v5 | Web routing framework for management configurations |
| **Data Validation** | Zod | Robust schema validation for runtime request filtering |
| **ORM** | Sequelize v6 | Controls administrative migrations, status checks, and data queries |
| **Style & Standard** | ESLint v9 | Enforces backend syntax patterns and operational consistency |

---

## Authorization Levels

All protected routes require a valid `Authorization: Bearer <token>` header issued at login.

| Middleware | Required Role | Applied To |
| :--- | :--- | :--- |
| `protectAdmin` | Any admin | Most read and status-update routes |
| `superAdminOnly` | `superadmin` role only | Register admin, delete admin, delete course, delete user, update user/admin status |

---

## Security Headers

The admin service sends security headers using Helmet. The policy is defined in
`config/securityHeaders.js` and applied as the first middleware in `server.js`,
before CORS and routes, so every response (including 404s and errors) carries
the headers.

```js
app.use(securityHeaders());   // must stay above cors() and routes
```

| Header | Value |
| ------ | ----- |
| Content-Security-Policy | `default-src 'none'; frame-ancestors 'none'` |
| Strict-Transport-Security | `max-age=15552000; includeSubDomains` (production only) |
| X-Frame-Options | `DENY` |
| X-Content-Type-Options | `nosniff` |
| Referrer-Policy | `no-referrer` |
| Cross-Origin-Resource-Policy | `same-origin` (Helmet default) |

* This service only returns JSON, so the CSP allows nothing to load.
* HSTS is sent only when `NODE_ENV=production`, so `http://localhost` keeps working. All other headers are the same in every environment.
* `helmet` must be installed in this service (`npm i helmet`).

Verify with `curl -i http://localhost:5001/health`, and run `npm test`
(`tests/securityHeaders.test.js`) to check the headers automatically.

---

## Administrative API Directory

All routes are prefixed with `/api/admin`.

---

### 1. Authentication (`/api/admin`)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| **POST** | `/login` | Public | Authenticate with email and password; returns a JWT token. |
| **POST** | `/register` | Superadmin | Create a new admin account (role defaults to `"admin"`). |
| **GET** | `/profile` | Admin | Return the authenticated admin's own profile. |
| **POST** | `/logout` | Admin | Invalidate the admin's session token. |
| **PUT** | `/change-password` | Admin | Update the authenticated admin's password. |
| **DELETE** | `/:id` | Superadmin | Permanently delete an admin account by ID. |

**Login request body:**
```json
{ "email": "admin@example.com", "password": "yourpassword" }
```

**Login success response:**
```json
{
  "token": "<jwt>",
  "admin": { "id": 1, "name": "Admin Name", "email": "admin@example.com", "role": "admin" }
}
```

---

### 2. Admin User Management (`/api/admin/admins`)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| **GET** | `/admins` | Admin | List all registered admin accounts. |
| **PATCH** | `/admins/:id/status` | Superadmin | Activate or deactivate an admin account by ID. |

---

### 3. Course Management (`/api/admin/courses`)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| **GET** | `/courses` | Admin | List all courses (all statuses visible). Supports `?search=` query. |
| **POST** | `/courses` | Admin | Create a new course with `title`, `category`, `priceValue`, `currency`. |
| **PATCH** | `/courses/:id/status` | Admin (Superadmin for `"deleted"`) | Update a course's status: `"published"`, `"disabled"`, or `"deleted"` (soft-delete — hides from public catalog without removing enrollment history). |
| **DELETE** | `/courses/:id` | Superadmin | **Permanently hard-delete** a course and cascade-delete its modules and lessons. Warns if students are enrolled; pass `?force=true` to confirm. |
| **GET** | `/courses/:id/enrollments` | Admin | List enrolled students for a course with pagination (`?page=&limit=`). |
| **GET** | `/courses/:id/learning` | Admin | Retrieve the full module and lesson syllabus tree for a course. |
| **POST** | `/courses/:id/generate-syllabus` | Admin | Call the AI service to auto-generate and persist a course syllabus. |

**Create course request body:**
```json
{ "title": "React Advanced", "category": "Frontend", "priceValue": 999, "currency": "INR" }
```

**Course status values:**

| Status | Effect |
| :--- | :--- |
| `published` | Visible to students in the public catalog |
| `disabled` | Hidden from the public catalog; enrollments are preserved |
| `deleted` | Soft-deleted; hidden from catalog; only superadmin can set this |

> **Note:** `PUT /courses/:id` (full course update) is **not currently implemented**. Use `PATCH /courses/:id/status` to change a course's status.

---

### 4. User Management (`/api/admin/users`)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| **GET** | `/users` | Admin | List all platform user accounts. |
| **PATCH** | `/users/:id/status` | Superadmin | Update a user's account status (e.g. active/inactive). |
| **PATCH** | `/users/:id/block` | Superadmin | Toggle a user's blocked state. |
| **DELETE** | `/users/:id` | Superadmin | Permanently delete a user account. |

---

### 5. Enrollment & Payment Analytics (`/api/admin`)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| **GET** | `/enrollments` | Admin | Aggregated enrollment metrics. Use `?type=stats` (default) for totals or `?type=list` for paginated enrollment records. |
| **GET** | `/payments` | Admin | Paginated payment transaction history. Supports `?page=`, `?limit=`, and `?search=`. |

**Enrollments stats response (`?type=stats`):**
```json
{
  "success": true,
  "data": {
    "totalEnrollments": 120,
    "totalUsers": 80,
    "activeUsers": 25,
    "totalRevenue": 98000,
    "totalCourses": 10
  }
}
```

---

### 6. Discussion Moderation (`/api/admin/discussions`)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| **GET** | `/discussions` | Admin | List all community posts. Supports `?type=global` or `?type=course` filter. |
| **PUT** | `/discussions/:id/hide` | Admin | Set a post's `hiddenAt` timestamp to hide it from public view. |
| **PUT** | `/discussions/:id/unhide` | Admin | Clear a post's `hiddenAt` timestamp to restore public visibility. |
| **DELETE** | `/discussions/:id` | Admin | Permanently delete a community post. |

---

### 7. Reports (`/api/admin/reports`)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| **GET** | `/reports` | Admin | List all user-submitted content reports, including reporter and post details. |

---

### 8. Course Reports (`/api/admin/course-reports`)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| **GET** | `/course-reports` | Admin | List all course-specific reports. |
| **PATCH** | `/course-reports/:id` | Admin | Update the status of a course report (`"pending"`, `"resolved"`, `"rejected"`). |
| **DELETE** | `/course-reports/:id` | Admin | Permanently delete a course report. |

---

### 9. Notifications (`/api/admin/notifications`)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| **GET** | `/notifications` | Admin | List the 30 most recent admin notifications. |
| **PATCH** | `/notifications/mark-all-read` | Admin | Mark all notifications as read. |
| **PATCH** | `/notifications/:id/read` | Admin | Mark a single notification as read by ID. |
| **DELETE** | `/notifications/clear` | Admin | Clear all notifications. |

---

## Endpoints Not Currently Implemented

The following capabilities are **planned but not yet active**. They must not be called against the running service:

| Planned Capability | Planned Path | Notes |
| :--- | :--- | :--- |
| Full course update | `PUT /courses/:id` | Update course title, price, category, etc. |
| Lesson CRUD | `POST/PUT/DELETE /lessons` | Add, edit, or remove individual lessons |
| Analytics summary | `GET /analytics/summary` | Platform-wide revenue and completion metrics |
| DB status / diagnostics | `GET /system/db-status` | Database health check endpoint |

---

## Configuration & Local Setup

### Environment Settings (`.env.example`)
Copy `.env.example` to `.env` inside the `backendAdmin` folder:

```bash
# Server
PORT=5001
FRONTEND_ADMIN_URL=http://localhost:5174
AI_SERVICE_URL=http://127.0.0.1:8000

# Authentication
JWT_SECRET=your_super_secret_jwt_key

# Database (Neon Cloud)
NEON_DATABASE_URL=postgresql://user:password@host/dbname?sslmode=verify-full&channel_binding=require

# Super Admin Seed credentials (used only by npm run seed:superadmin)
SUPER_ADMIN_NAME=Super Admin
SUPER_ADMIN_EMAIL=admin@yourdomain.com
SUPER_ADMIN_PASSWORD=strong_admin_password
```

### System Installation Instructions

1. **Install Administrative Dependencies:**
   ```bash
   cd backendAdmin
   npm install
   ```

2. **Seed the Superadmin account** (first-time setup only):
   ```bash
   npm run seed:superadmin
   ```

3. **Run Linter Quality Check:**
   ```bash
   npm run lint
   ```

4. **Boot Development Environment:**
   ```bash
   npm run dev
   ```

The backend administration service runs on `http://localhost:5001`.
