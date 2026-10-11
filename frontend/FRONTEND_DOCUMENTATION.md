# AI Mentor Frontend Documentation

# Introduction

The AI Mentor frontend is a React and Vite based single page application responsible for delivering the complete user experience of the AI Mentor learning platform.

The frontend communicates with the Node.js backend API and provides:

* User authentication
* Course browsing
* AI generated lesson playback
* Community discussions
* Learning analytics
* User profile management
* Theme and language customization
* Admin route placeholders in the learner frontend

The frontend is designed using a modular React architecture with reusable UI components, React Context-based state management, protected routing, and responsive Tailwind-based layouts.

API communication currently uses multiple request patterns rather than a single centralized HTTP client. These include the shared `apiFetch` helper, direct native `fetch` calls, and direct Axios calls. The documentation below describes these patterns as they are currently implemented.

---

# Frontend System Architecture

```text
                    ┌──────────────────────┐
                    │     User Browser     │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │   React + Vite App   │
                    └──────────┬───────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
        ▼                      ▼                      ▼
┌────────────────┐   ┌────────────────┐   ┌────────────────┐
│ React Router   │   │ Context APIs   │   │ UI Components  │
└────────────────┘   └────────────────┘   └────────────────┘
        │                      │                      │
        └──────────────────────┼──────────────────────┘
                               │
                               ▼
                 ┌──────────────────────────────┐
                 │   API Communication Layer    │
                 │                              │
                 │  • apiFetch helper           │
                 │  • Native fetch              │
                 │  • Direct Axios              │
                 └─────────────┬────────────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │    Backend API       │
                    └──────────────────────┘

Administrators and super administrators do not use learner-frontend admin pages. When an authorized admin visits a learner `/admin` entry point, the learner app redirects the browser to the supported `frontendAdmin` application.
```

---

# External Integrations

The frontend communicates with several external systems:

```text
Frontend Application
 ├── Express Backend API
 ├── Firebase Authentication
 ├── Cloudinary Media URLs
 ├── FastAPI AI Video Service
 ├── PostgreSQL Data via Backend
 ├── Frontend Admin application for admin workflows
 └── i18next Translation Engine
```

---

# Tech Stack

| Category             | Technology            |
| -------------------- | --------------------- |
| Framework            | React 19              |
| Build Tool           | Vite 7                |
| Routing              | React Router DOM      |
| Styling              | Tailwind CSS          |
| State Management     | React Context API     |
| HTTP Communication   | Native fetch, apiFetch|
|                      | helper, and Axios     |
| Authentication       | Firebase Google OAuth |
| Charts               | Recharts              |
| Icons                | Lucide React          |
| Notifications        | React Hot Toast       |
| Internationalization | i18next               |

---

# Folder Structure

```text
frontend/
├── public/
├── src/
│   ├── assets/
│   ├── components/
│   ├── context/
│   ├── i18n/
│   ├── lib/
│   ├── pages/
│   ├── service/
│   ├── App.jsx
│   ├── main.jsx
│   ├── firebase.js
│   └── index.css
├── package.json
├── vite.config.js
└── .env
```

---

# Application Entry Flow

## main.jsx

The frontend application starts from `main.jsx`.

Responsibilities:

* Create React root
* Attach application to DOM
* Initialize providers
* Initialize routing
* Import global styles

Flow:

```text
main.jsx
   │
   ▼
<App />
   │
   ▼
React Router
   │
   ▼
Pages + Components
```

---

# Root Application Layer

## App.jsx

`App.jsx` acts as the root routing layer.

Responsibilities:

* Configure frontend routes
* Handle protected routes
* Guard admin handoff routes
* Render layouts
* Redirect unauthorized users

---

# Routing Architecture

The frontend uses React Router DOM.

## Route Types

| Route Type       | Purpose                           |
| ---------------- | --------------------------------- |
| Public Routes    | Accessible without authentication |
| Protected Routes | Require logged in user            |
| Admin Handoff Routes | Require admin or superadmin privileges and redirect to `frontendAdmin` |

---

# Route Flow Diagram

```text
User Navigation
       │
       ▼
React Router
       │
       ▼
ProtectedRoute / AdminRoute
       │
       ▼
Page Component or frontendAdmin redirect
       │
       ▼
API Requests + UI Rendering
```

---

# Main Routes

| Route         | Description             |
| ------------- | ----------------------- |
| /login        | User login page         |
| /signup       | User registration       |
| /dashboard    | Main learning dashboard |
| /courses      | Course catalog          |
| /learning/:id | AI lesson player        |
| /analytics    | User learning analytics |
| /discussions  | Community discussions   |
| /settings     | User settings           |
| /admin        | Admin route placeholder |
|               | in the learner frontend |

---

# Authentication System

The frontend supports:

* Email/password authentication
* Google OAuth authentication
* JWT session persistence
* Password reset workflows

---

# Authentication Architecture

The frontend supports multiple authentication flows and request mechanisms.

**Email/Password Login**

The login page validates the credentials using Zod and sends the login request directly through Axios.

```text
Login Form
    |
    v
Zod Validation
    |
    v
Direct Axios Request
    |
    v
POST /api/auth/login
    |
    v
Backend Authentication
    |
    v
JWT Token + User Data
    |
    v
AuthContext.login()
    |
    v
localStorage
    |
    v
Protected Routes
```
---

# AuthContext

`AuthContext.jsx` manages the frontend authentication state.

Responsibilities:

* Store the authenticated user
* Store authentication state
* Persist the JWT token and user information in `localStorage`
* Provide login and logout functions
* Restore authentication state from `localStorage`
* Fetch the authenticated user's profile
* Update user information
* Integrate Firebase sign-out during logout

## Authentication Persistence

On application initialization, `AuthContext` checks for:

* `token` in `localStorage`
* `user` in `localStorage`

When both are available, the frontend restores the authenticated state.

## Login

The `login()` method:

1. Receives user data from an authentication flow.
2. Stores the JWT token in `localStorage`.
3. Stores serialized user information in `localStorage`.
4. Updates the React authentication state.

## User Profile Fetch

After authentication, `AuthContext` can retrieve the current user profile through the shared API helper.

```text
AuthContext
    |
    v
apiFetch("/api/users/profile")
    |
    v
Backend User Profile API
    |
    v
Updated User Data
    |
    v
React State + localStorage
```
---

# Google OAuth Flow

The frontend integrates Firebase Google authentication.

Google authentication uses Firebase for the Google sign-in popup. After Firebase returns an ID token, the frontend sends that token to the backend using a native `fetch` request.
```text
Google Sign-In
    │
    ▼
Firebase Authentication
    │
    ▼
Firebase ID Token
    │
    ▼
Native fetch()
    │
    ▼
POST /api/auth/google-login
    │
    ▼
Backend Token Verification
    │
    ▼
Application JWT
    │
    ▼
AuthContext.login()
    │
    ▼
Protected Routes
```
---

# ProtectedRoute Component

`ProtectedRoute.jsx` controls access to authenticated routes using the authentication state and profile-completion status provided by `AuthContext`.

Responsibilities:

- Check whether the user is authenticated.
- Redirect unauthenticated users to `/login`.
- Redirect authenticated users with an incomplete profile to `/complete-profile`.
- Allow authenticated users to access protected routes through React Router's `Outlet`.
- Redirect users with completed profiles from `/complete-profile` to `/dashboard`.

## Route Access Logic

### Unauthenticated User

If `isAuthenticated` is false, the user is redirected to `/login`.

### Authenticated User with an Incomplete Profile

If the user is authenticated but their profile is incomplete, they are redirected to `/complete-profile`, unless they are already on that route.

### Authenticated User with a Completed Profile

If the user is authenticated and their profile is complete, they can access protected routes. If they are on `/complete-profile`, they are redirected to `/dashboard`.

```text
Protected Route
      |
      v
Authenticated?
  |           |
  No          Yes
  |            |
  v            v
/login    Profile Complete?
              |         |
              No        Yes
              |          |
              v          v
     /complete-profile  Allow Protected Route
```

Implementation: `ProtectedRoute.jsx` uses `Navigate` for redirects and `Outlet` to render nested routes. It also uses `useNavigate` in an effect to redirect users whose profiles are complete, where applicable.
---

# AdminRoute Component

`AdminRoute.jsx` provides role-based protection for admin routes.

The component performs the following checks:

1. If the user is not authenticated, redirect to `/login`.
2. If the authenticated user has not yet loaded, display a loading state.
3. Only users with one of the following roles are allowed:
   * `admin`
   * `superadmin`
4. Other authenticated users are redirected to `/`.

## Admin Route Access Logic

```text id="7d3q1x"
User
  │
  ▼
Authenticated?
  ├── No ───────► /login
  │
  └── Yes
       │
       ▼
User Loaded?
  ├── No ───────► Loading...
  │
  └── Yes
       │
       ▼
Role = admin or superadmin?
  ├── No ───────► /
  │
  └── Yes ──────► Admin Route
```

---

# Context Architecture

The frontend uses React Context API for global state.

Main contexts:

| Context        | Purpose              |
| -------------- | -------------------- |
| AuthContext    | Authentication state |
| SidebarContext | Sidebar visibility   |
| ThemeContext   | Theme state          |

---

# ThemeContext

Controls:

* Dark mode
* Light mode
* Theme persistence
* Theme toggling

The selected theme is stored locally for persistence.

---

# SidebarContext

Controls:

* Sidebar open state
* Mobile sidebar visibility
* Sidebar collapse behavior

Used across:

* Dashboard layout
* Admin panel
* Mobile responsive navigation

---

# Component Architecture

The frontend follows reusable component architecture.

```text
Pages
  │
  ▼
Reusable Components
  │
  ▼
UI Elements
```

---

# Component Categories

| Category             | Responsibility        |
| -------------------- | --------------------- |
| Auth Components      | Login/signup forms    |
| Common Components    | Shared reusable UI    |
| Video Components     | Video playback system |
| Layout Components    | Header/sidebar        |
| Analytics Components | Charts and metrics    |

---

# Layout System

Main layout components:

* Header
* Sidebar
* Mobile navigation
* Dashboard wrappers

Responsibilities:

* Navigation
* Theme controls
* User profile display
* Notifications
* Responsive layouts

---

# Course System

The course module handles:

* Course listing
* Course previews
* Lesson playback
* Course purchasing
* Learning progress

---

# Course Flow

```text
Course List Page
       │
       ▼
Course Preview Page
       │
       ▼
Purchase / Enrollment
       │
       ▼
Learning Page
       │
       ▼
AI Video Playback
```

---

# CoursePage.jsx

Responsibilities:

* Fetch all courses
* Render course cards
* Handle filtering/searching
* Navigation to previews

---

# CoursePreview.jsx

Displays:

* Course information
* Lesson overview
* Pricing
* Enrollment options
* Instructor details

---

# LearningPage.jsx

The learning page is the core educational interface.

Responsibilities:

* Load lessons
* Request AI videos
* Display transcripts
* Track watched videos
* Save learning progress

---

# AI Video Generation Flow

```text
User Opens Lesson
       │
       ▼
Frontend Requests AI Video
       │
       ▼
Backend AI Endpoint
       │
       ▼
FastAPI AI Service
       │
       ▼
Generated Video
       │
       ▼
Frontend Video Player
```

---

# Video Player System

Responsibilities:

* Stream AI videos
* Display playback controls
* Handle loading states
* Manage transcripts
* Track watch history

---

# Watched Videos System

The frontend stores and displays:

* Previously watched lessons
* Video history
* Recently viewed content

Features:

* Resume learning
* Continue watching
* Playback tracking

---

# Community Discussion System

The discussion module supports:

* Course discussions
* Global discussions
* Replies
* Likes/dislikes
* Reporting

---

# Community Architecture

```text
Discussion Page
       │
       ▼
Community Components
       │
       ▼
HTTP API Requests
       │
       ▼
Backend Community APIs
```

---

# Discussion Features

Users can:

* Create posts
* Reply to discussions
* Like/dislike posts
* Edit replies
* Report inappropriate content

---

# Reporting System

Flow:

```text
User Reports Content
        │
        ▼
Frontend Report Modal
        │
        ▼
Backend Report Endpoint
        │
        ▼
Admin Dashboard Moderation
```

---

# Analytics System

The analytics module provides:

* Learning progress
* Course completion
* Watch statistics
* Engagement metrics

---

# Analytics Architecture

```text
Backend Analytics Data
          │
          ▼
HTTP API Requests
          │
          ▼
Analytics Data Processing
          │
          ▼
Recharts Visualization
          │
          ▼
Interactive Dashboard UI
```

---

# Recharts Integration

Charts used include:

* Line charts
* Bar charts
* Pie charts
* Progress graphs

Purpose:

* Improve learning visualization
* Display user progress
* Show engagement statistics

---

# Settings System

The settings page manages:

* Profile editing
* Notification preferences
* Theme switching
* Language settings
* Password updates

---

# Settings Architecture

```text
Settings Page
      │
      ▼
Panel Rendering System
      │
      ▼
Controlled Input Forms
      │
      ▼
Backend Profile APIs
```

---

# Controlled Form System

The frontend uses controlled React inputs.

Advantages:

* Real time validation
* State synchronization
* Dynamic updates
* Better form control

---

# Appearance System

The appearance module controls:

* Dark mode
* Theme persistence
* Visual preferences

Theme selection is preserved using local storage.

---

# Internationalization System

The frontend supports multilingual content using i18next.

Responsibilities:

* Dynamic translation loading
* Language switching
* Translation persistence

---

# Translation Architecture

```text
User Selects Language
          │
          ▼
I18next Changes Locale
          │
          ▼
Translation Files Loaded
          │
          ▼
UI Re-rendered
```

---

# Styling Architecture

The frontend uses Tailwind CSS.

Advantages:

* Utility first design
* Faster UI development
* Responsive layouts
* Consistent styling

---

# Responsive Design System

The UI supports:

* Desktop devices
* Tablets
* Mobile devices

Responsive techniques:

* Tailwind breakpoints
* Flexible layouts
* Adaptive navigation
* Mobile sidebars

---

# API Communication Layer

The frontend uses multiple HTTP communication patterns to interact with the backend REST APIs. There is no single centralized HTTP client used by every request.

The currently observed patterns are:

- Shared `apiFetch` helper
- Direct native `fetch()` calls
- Direct Axios calls

These patterns reflect the current implementation. No migration to a single centralized HTTP client is documented as part of this change.

## 1. Shared `apiFetch` Helper

The shared API helper is located at `frontend/src/lib/api.js`. It wraps the browser's native `fetch()` API and provides common request headers, JWT token attachment, and centralized handling of HTTP `401 Unauthorized` responses.

### Base URL Configuration

The API base URL is configured using the `VITE_API_BASE_URL` environment variable.

- If `VITE_API_BASE_URL` is defined, its value is used.
- Otherwise, the helper defaults to `http://localhost:5000`.

### Request Handling

The `apiFetch(url, options = {})` helper:

1. Reads the JWT token from `localStorage` using the key `token`.
2. Constructs the request URL using `API_BASE_URL` and the supplied URL.
3. Sets `Content-Type: application/json` by default.
4. Adds the `Authorization: Bearer <token>` header when a token exists.
5. Preserves additional request options, such as the HTTP method and request body.
6. Merges caller-supplied headers with the default headers. Caller-supplied headers take precedence when their keys match existing headers.
7. Returns the fetch response for requests that do not receive an HTTP `401` status.

### Centralized 401 Handling

When a request made through `apiFetch()` receives a `401 Unauthorized` response, the helper:

1. Removes `token` and `user` from `localStorage`.
2. Displays `Session expired. Please login again.` using `react-hot-toast`.
3. Redirects the browser to `/login` after a two-second delay.
4. Returns `null` instead of the response.

**Important:** This centralized `401` handling applies only to requests made through `apiFetch()`. Direct native `fetch()` and direct Axios requests do not automatically use this helper's behavior.

### Example

```javascript
import { apiFetch } from "../lib/api";

const response = await apiFetch("/api/users/profile");

if (response) {
  const data = await response.json();
  // Handle the response data.
}
```

Callers should account for `apiFetch()` returning `null` when a `401 Unauthorized` response occurs.

## 2. Direct Native `fetch()` Calls

Some frontend features use the browser's native `fetch()` API directly instead of using `apiFetch()`.

Examples include:

- Registration: `POST /api/auth/register`
- Google login: `POST /api/auth/google-login`

These requests do not automatically inherit the token attachment or centralized `401` handling implemented in `apiFetch()`. Their URL construction, headers, and error handling depend on their individual implementations.

## 3. Direct Axios Calls

Some frontend features use Axios directly.

For example, `LoginPage.jsx` sends the email/password login request using Axios:

- `POST /api/auth/login`

Although Axios is included as a frontend dependency, there is no single Axios service or instance responsible for all frontend API communication.

### 4. Current API Architecture

```text
React Components
       |
   +---+----------+
   |              |
   v              v
apiFetch()      fetch()       Axios
   |              |             |
   +--------------+-------------+
                  |
                  v
           Backend REST APIs
```

The frontend uses mixed HTTP communication patterns rather than a fully centralized client. URL construction, authentication, and error handling may differ depending on the request implementation.
---

# Error Handling System

The frontend handles:

* API errors
* Authentication errors
* Validation failures
* Loading states
* Empty states

---

# Toast Notification System

The frontend uses React Hot Toast.

Used for:

* Success messages
* Error alerts
* Loading notifications
* User feedback

---

# Loading State Management

Common loading systems:

* Page loading
* Button loading
* API request loading
* Skeleton screens

Purpose:

Improve user experience during asynchronous operations.

---

# Environment Variables

The frontend uses Vite environment variables for backend and Firebase configuration.

## Variables Validated During Startup

The Vite configuration validates the following variables:

```env
VITE_API_BASE_URL=
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

All required values must be configured according to the validation rules in `frontend/vite.config.js`.
---

# Vite Configuration

`vite.config.js` handles:

* Development server
* API proxying
* Environment loading
* Build optimization

---

# API Proxy System
During local development, Vite can proxy matching relative `/api` requests to the configured backend.

```text
Frontend Request
      |
      v
Vite Development Server
      |
      v
Backend API
```

The proxy applies only to requests sent to the Vite development server using matching relative URLs. Requests sent directly to an absolute backend URL bypass the Vite proxy.

The proxy can help avoid browser cross-origin issues during local development, but it does not automatically apply to every API request.
---

# Firebase Integration

Firebase is used only for:

* Google OAuth login
* Google account verification

The frontend initializes Firebase inside:

```text
firebase.js
```

---

# Build Process

The frontend uses Vite production builds.

Command:

```bash
npm run build
```

Responsibilities:

* Bundle optimization
* Asset optimization
* Code splitting
* Production compilation

---

# Performance Optimizations

## Lazy Loading

Used for:

* Large pages
* Heavy analytics components
* Route optimization

---

# Memoization

The frontend uses:

* useMemo
* useCallback
* Optimized rendering

Purpose:

Reduce unnecessary re-renders.

---

# Rendering Optimization

Techniques include:

* Controlled component rendering
* State separation
* Component reuse
* Efficient conditional rendering

---

# Security Measures

## JWT Protection

The shared `apiFetch()` helper reads the JWT from `localStorage` and adds it to the `Authorization` header when a token exists.

```http
Authorization: Bearer <token>
```

This behavior applies to requests made through `apiFetch()`. Other request implementations may handle authentication separately.

---

## Protected Routes

Unauthorized users cannot access protected pages.

---

## Current Admin Frontend Status

The current `frontend` application defines admin routes protected by `AdminRoute`, but their route elements are currently placeholders.

Current routes:

- `/admin` → `Admin Dashboard` placeholder
- `/admin/users` → `Manage Users` placeholder
- `/admin/courses` → `Manage Courses` placeholder

These routes demonstrate the current routing and role-based access control (RBAC) structure. However, they should not be described as fully implemented admin dashboard pages.

The repository also contains a separate `frontendAdmin/` application. The admin routes in the learner-facing `frontend` application are limited to their current placeholder implementation.

## Input Validation

Frontend validates:

* Email formats
* Required fields
* Password constraints
* Form data

---

# Local Development Setup

## Installation

```bash
cd frontend
npm install
```
## Vite API Proxy

Vite is configured with a development proxy for requests beginning with `/api`.

The development server runs on `http://localhost:5173`.

In `frontend/vite.config.js`, requests beginning with `/api` are proxied to the backend URL configured by `VITE_API_BASE_URL`.

### Proxy Configuration

```javascript
proxy: {
  "/api": {
    target: env.VITE_API_BASE_URL,
    changeOrigin: true,
  },
}
```

### Request Flow

```text
Browser
   |
   | Relative /api request
   v
Vite Development Server
   |
   v
Backend API
```

### Important Distinction

The Vite proxy is a development-server configuration. It handles requests sent to the Vite development server using relative `/api` URLs.

- **Relative URLs:** A request such as `fetch('/api/auth/register')` uses the Vite proxy when sent to the Vite development server.
- **Absolute URLs:** A request using a full backend URL communicates directly with that backend and bypasses the Vite proxy.
- **`apiFetch()`:** The helper in `frontend/src/lib/api.js` constructs request URLs using `API_BASE_URL`. It defaults to `http://localhost:5000` when `VITE_API_BASE_URL` is not set, so these requests bypass the Vite proxy.

The actual request path depends on how each API call constructs its URL.
---

# Development Server

```bash
npm run dev
```

Application runs on:

```text
http://localhost:5173
```

---

# Production Deployment

Frontend can be deployed using:

* Vercel
* Netlify
* Render
* Firebase Hosting

---

# Deployment Flow

```text
GitHub Repository
        │
        ▼
Production Build
        │
        ▼
Hosting Platform
        │
        ▼
Live Frontend Application
```

---

# Future Improvements

Potential future upgrades:

* Zustand or Redux
* React Query
* WebSockets
* Real time chat
* PWA support
* Offline caching
* Automated testing
* Storybook integration
* SSR support
* Micro frontend architecture

---

# Conclusion

The AI Mentor frontend is a scalable and modular React application designed to provide:

* AI powered learning
* Interactive educational experiences
* Community collaboration
* Learning analytics
* Secure authentication
* Responsive user interfaces
