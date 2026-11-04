# AI Mentor — Frontend

The React + Vite frontend for the **AI Mentor** learning platform. It provides the learner experience including course browsing, AI-powered video lessons, community discussions, analytics, and user account management.

---

## ✨ Features

| Feature           | Description                                                                  |
| ----------------- | ---------------------------------------------------------------------------- |
| 🔐 Authentication | Email/password login, Google OAuth (Firebase), forgot/reset password         |
| 📚 Courses        | Browse, preview, and purchase courses; track lesson progress                 |
| 🤖 AI Lessons     | Generate celebrity-narrated lesson videos on demand via the AI service       |
| 💬 Discussions    | Community discussion boards per course                                       |
| 📊 Analytics      | Personal learning statistics and progress charts (Recharts)                  |
| 🎥 Watched Videos | History of all viewed AI-generated lessons                                   |
| ⚙️ Settings       | Profile management, theme toggle (light/dark), language switching            |
| 🛡️ Admin Handoff  | Authorized admins are redirected to the separate `frontendAdmin` application |
| 🌐 i18n           | Multi-language support via `i18next`                                         |

---

## 🛠 Tech Stack

| Layer         | Technology              |
| ------------- | ----------------------- |
| Framework     | React 19 + Vite 7       |
| Routing       | React Router DOM v7     |
| Styling       | Tailwind CSS v4         |
| HTTP Client   | Axios                   |
| Auth (Social) | Firebase (Google OAuth) |
| Charts        | Recharts                |
| Icons         | Lucide React            |
| i18n          | i18next + react-i18next |
| Notifications | React Hot Toast         |

---

## 📁 Project Structure

```
frontend/
├── public/                # Static assets
├── src/
│   ├── assets/            # Images and media
│   ├── components/        # Reusable components
│   │   ├── auth/          # Auth-specific components
│   │   ├── common/        # Shared UI components
│   │   ├── video/         # Video player components
│   │   ├── Header.jsx     # Top navigation bar
│   │   ├── Sidebar.jsx    # Navigation sidebar
│   │   ├── ProtectedRoute.jsx
│   │   └── AdminRoute.jsx
│   ├── context/           # React Context providers
│   │   ├── AuthContext.jsx    # Auth state & user session
│   │   ├── SidebarContext.jsx # Sidebar open/close state
│   │   └── ThemeContext.jsx   # Light/dark theme state
│   ├── i18n/              # Translation files
│   ├── lib/               # Utility helpers
│   ├── pages/             # Route-level page components
│   │   ├── LoginPage.jsx
│   │   ├── SignUpPage.jsx
│   │   ├── ForgotPassword.jsx
│   │   ├── ResetPassword.jsx
│   │   ├── Dashboard.jsx
│   │   ├── CoursesPage.jsx
│   │   ├── CoursePreview.jsx
│   │   ├── LearningPage.jsx      # AI lesson player
│   │   ├── Analytics.jsx
│   │   ├── DiscussionsPage.jsx
│   │   ├── WatchedVideos.jsx
│   │   ├── Settings.jsx
│   │   └── AdminPage.jsx
│   ├── service/           # API service layer (Axios calls)
│   ├── App.jsx            # Root router/route definitions
│   ├── firebase.js        # Firebase app initialization
│   ├── main.jsx           # React entry point
│   └── index.css          # Global styles
├── .env.example           # Environment variable template
├── vite.config.js         # Vite + Tailwind config + API proxy
├── eslint.config.js
└── package.json
```

---

## ⚙️ Environment Variables

Copy `.env.example` to `.env` and fill in the values:

```env
# Backend API base URL (proxied via Vite)
VITE_API_BASE_URL=http://localhost:5000

# Firebase project credentials (for Google OAuth)
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

> **Tip:** Get Firebase credentials from the [Firebase Console](https://console.firebase.google.com/).
> Enable **Google Sign-In** under _Authentication → Sign-in method_.

---

> **Repository-root workflow:** For normal development, use `npm run setup` and `npm run dev:frontend` from the repository root. The runner verifies that the User API is healthy before starting Vite.

## 🚀 Getting Started

### Prerequisites

- Node.js v18+
- npm or yarn
- Backend server running on `http://localhost:5000` (see `../backend/README.md`)

### Installation

```bash
# From the project root
cd frontend

# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env
# Edit .env with your credentials

# Start the development server
npm run dev
```

The app will be available at **http://localhost:5173**.

### Available Scripts

| Script            | Description                          |
| ----------------- | ------------------------------------ |
| `npm run dev`     | Start the Vite development server    |
| `npm run build`   | Build for production                 |
| `npm run preview` | Preview the production build locally |
| `npm run lint`    | Run ESLint                           |

---

## 🔀 Routing Overview

| Path                        | Page                                                        | Access                   |
| --------------------------- | ----------------------------------------------------------- | ------------------------ |
| `/`                         | Redirects based on auth status                              | Public                   |
| `/login`                    | Login page                                                  | Public only              |
| `/signup`                   | Sign up page                                                | Public only              |
| `/forgot-password`          | Forgot password                                             | Public only              |
| `/reset-password/:token`    | Reset password                                              | Public only              |
| `/dashboard`                | User dashboard                                              | Protected                |
| `/courses`                  | Course catalogue                                            | Protected                |
| `/course-preview/:courseId` | Course detail/preview                                       | Public                   |
| `/learning/:id`             | AI lesson player                                            | Protected                |
| `/discussions`              | Community discussions                                       | Protected                |
| `/analytics`                | Learning analytics                                          | Protected                |
| `/watchedvideos`            | Watched video history                                       | Protected                |
| `/settings`                 | Account settings                                            | Protected                |
| `/admin`                    | Redirects authorized admins to `frontendAdmin` dashboard    | Admin or superadmin only |
| `/admin/users`              | Redirects authorized admins to `frontendAdmin` users page   | Admin or superadmin only |
| `/admin/courses`            | Redirects authorized admins to `frontendAdmin` courses page | Admin or superadmin only |

---

## 🔌 API Communication

All API calls are proxied through Vite to the backend at `http://localhost:5000`. The proxy is configured in `vite.config.js`:

```js
proxy: {
  "/api": {
    target: env.VITE_API_BASE_URL,
    changeOrigin: true,
  },
}
```

This means frontend calls to `/api/...` are transparently forwarded to the backend without CORS issues during development.

---

## 🧭 API Error Handling

The frontend expects the backend error payload in the standardized shape:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": []
  }
}
```

The shared client and error utility in `frontend/src/lib/api.js` and `frontend/src/lib/errorHandling.js` normalize the backend contract before UI code displays it.

### Error normalization flow

The frontend utility extracts values in this priority order:

- `error.response.data.error.code` / `error.response.data.error.message` / `error.response.data.error.details`
- `error.response.data.code` / `error.response.data.message` / `error.response.data.details`
- `error.code`, `error.message`, `error.details`

This is implemented by `normalizeApiError()`, which returns an object shaped like:

```js
{
  code: "VALIDATION_ERROR",
  message: "Request validation failed",
  details: [],
  status: 400,
  raw: { ... }
}
```

The helper exports:

- `normalizeApiError(error, fallbackMessage)`
- `getErrorMessage(error, fallbackMessage)`
- `getFieldErrors(error)`

These helpers are used by the app to display safe UI messages and map validation errors into form fields when details include `field`, `path`, or `name` metadata.

### Shared API client behavior

The shared fetch wrapper in `frontend/src/lib/api.js` adds the stored bearer token for protected `/api/*` requests, preserves the original `Response`, and handles `401` responses by clearing the session when the token matches the current stored token and dispatching the `auth:session-expired` event.

There is also an Axios response interceptor in the same module for Axios-based requests, and it performs the same session-expiration handling before rejecting the request.

### User-facing handling

A typical frontend flow looks like this:

```js
import { apiFetch } from "../lib/api";
import { getErrorMessage, getFieldErrors } from "../lib/errorHandling.js";

try {
  const response = await apiFetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const error = { response: { data: payload, status: response.status } };
    const fieldErrors = getFieldErrors(error);

    if (Object.keys(fieldErrors).length > 0) {
      // show field-level validation errors
    }

    throw error;
  }

  const data = await response.json();
  return data;
} catch (error) {
  const code = normalizeApiError(error).code;

  if (code === "UNAUTHORIZED") {
    // show login or session message
  } else if (code === "CONFLICT") {
    // handle duplicate resource state
  } else if (code === "VALIDATION_ERROR") {
    // map details to inputs
  } else {
    // generic fallback
  }

  toast.error(getErrorMessage(error, "Something went wrong. Please try again."));
}
```

This pattern keeps the UI logic away from brittle `error.response.data.message` checks and relies on stable codes instead of comparing strings.

### Status and code handling

The frontend is designed to handle the backend's major public error categories:

| HTTP status | Error code(s)                                     | Typical frontend behavior                                                          |
| ----------- | ------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `400`       | `BAD_REQUEST`, `VALIDATION_ERROR`, `INVALID_JSON` | Show validation message, map field details when available                          |
| `401`       | `UNAUTHORIZED`                                    | Clear session only when the token is still current; redirect or show login message |
| `403`       | `FORBIDDEN`                                       | Display authorization warning and keep the user on the safe route                  |
| `404`       | `NOT_FOUND`, `ROUTE_NOT_FOUND`                    | Show a not-found message or route fallback                                         |
| `409`       | `CONFLICT`                                        | Show duplicate conflict or state message                                           |
| `413`       | `PAYLOAD_TOO_LARGE`                               | Show upload/size limit message                                                     |
| `500`       | `INTERNAL_SERVER_ERROR`                           | Show generic error message without exposing server internals                       |

### Network and malformed responses

The normalization layer also handles edge cases:

- Network failures / fetch exceptions → falls back to `DEFAULT_ERROR_MESSAGE`
- Empty or malformed JSON bodies → returns a safe fallback message
- Unexpected server responses → use `error.code` when present, otherwise the generic fallback
- Timeout or connection issues → surfaced as a user-friendly message without leaking stack traces or internal details

### Admin-specific note

The learner frontend redirects authorized admins to the separate admin app. The error-handling pattern is the same: normalize the backend envelope, prefer stable error codes over string comparisons, and show safe public messages while preserving business flows and navigation behavior.

---
