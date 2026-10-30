# AI Mentor Frontend Admin Documentation

# Introduction

The Frontend Admin application is the administrative control panel of the AI Mentor platform. It is built using React and Vite and provides administrative interfaces for managing users, courses, reports, enrollments, payments, analytics, notifications, and platform moderation.

The admin frontend communicates with the dedicated backendAdmin API server and provides secure access control for administrators and super administrators.

The system is designed using modular React architecture with reusable UI components, JWT-based access checks, responsive dashboard layouts, centralized API communication, and pathname-based page rendering.

---

# Frontend Admin System Architecture

```text
                    ┌────────────────────────┐
                    │     Admin Browser      │
                    └──────────┬─────────────┘
                               │
                               ▼
                    ┌────────────────────────┐
                    │  React + Vite Admin UI │
                    └──────────┬─────────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
        ▼                      ▼                      ▼
┌────────────────┐   ┌────────────────┐   ┌────────────────┐
│ BrowserRouter  │   │ Theme/Toast    │   │ UI Components  │
│                │   │ Contexts       │                  │
└────────────────┘   └────────────────┘   └────────────────┘
        │                      │                      │
        └──────────────────────┼──────────────────────┘
                               │
                               ▼
                    ┌────────────────────────┐
                    │ /api fetch + Axios    │
                    │ calls through Vite    │
                    │ proxy                 │
                    └──────────┬─────────────┘
                               │
                               ▼
                    ┌────────────────────────┐
                    │ Backend Admin API      │
                    └────────────────────────┘
```

---

# Main Responsibilities

The frontend admin dashboard handles:

- Admin authentication
- Super admin authorization
- Course management
- User moderation
- Enrollment monitoring
- Payment tracking
- Report moderation
- Notification management
- Dashboard metrics
- Admin profile viewing
- Theme settings

---

# Tech Stack

| Category         | Technology            |
| ---------------- | --------------------- |
| Framework        | React 19              |
| Build Tool       | Vite                  |
| Routing          | React Router DOM      |
| Styling          | Tailwind CSS          |
| Icons            | Lucide React          |
| HTTP Client      | Axios                 |
| Notifications    | React Hot Toast       |
| State Management | React Hooks + Context |
| Authentication   | `jwt-decode` + localStorage |
| Data export      | ExcelJS, FileSaver, PapaParse, jsPDF, jsPDF-AutoTable |
| API helpers      | Axios and the native Fetch API |
| Utilities        | `jwt-decode` for token claims |

---

# Folder Structure

```text
frontendAdmin/
├── public/
│   ├── upto.png
│   └── US.png
├── src/
│   ├── components/
│   │   ├── common/
│   │   └── layout/
│   ├── constants/
│   ├── context/
│   ├── data/
│   ├── __tests__/
│   ├── pages/
│   ├── utils/
│   ├── App.jsx
│   ├── index.css
│   └── main.jsx
├── package.json
├── vite.config.js
└── .env.example
```

---

# Application Startup Flow

```text
main.jsx
    │
    ▼
BrowserRouter + ThemeProvider
    │
    ▼
<App />
    │
    ▼
JWT role/expiry check
    │
    ▼
Pathname-to-page mapping
    │
    ▼
Admin layout or login/not-found page
```

---

# Root Application Layer

## App.jsx

The `App.jsx` file is the root controller of the frontend admin application.

Responsibilities:

- Route rendering
- Page switching
- Authentication checks
- Layout rendering
- Sidebar rendering
- Header rendering
- Dashboard rendering
- Route synchronization

---

# Dynamic Page Rendering System

The admin panel uses dynamic page rendering.

```js
const PAGE_COMPONENTS = {
  dashboard: DashboardPage,
  courses: CoursesPage,
  users: UsersPage,
  enrollments: EnrollmentsPage,
  payments: PaymentsPage,
  reports: ReportsPage,
  profile: ProfilePage,
  settings: SettingsPage,
  discussions: DiscussionsPage,
};
```

`App.jsx` reads `location.pathname`, selects the matching component, and renders it inside the shared layout. `/login` is handled separately, and unknown paths render `NotFoundPage`.

Advantages:

- Cleaner architecture
- Reusable layout system
- Reduced route duplication
- Easier scalability

---

# Routing Architecture

The app uses React Router DOM for `BrowserRouter`, `useLocation`, `useNavigate`, and redirects. It does not declare a separate `<Routes>`/`<Route>` table. `App.jsx` maps the pathname (without its leading slash) to a page component.

---

# Route Flow

```text
Sidebar Navigation
         │
         ▼
useNavigate() updates the browser path
         │
         ▼
App.jsx reads location.pathname
         │
         ▼
Page Component Rendering
```

---

# Main Routes

| Route        | Description         |
| ------------ | ------------------- |
| /login       | Admin login page    |
| /dashboard   | Dashboard analytics |
| /courses     | Course management   |
| /users       | User management     |
| /enrollments | Enrollment tracking |
| /payments    | Payment monitoring  |
| /reports     | Report moderation   |
| /discussions | Discussion reviews   |
| /profile     | Admin profile       |
| /settings    | Dashboard settings  |

`/profile` and `/settings` are available from the header and are not entries in the sidebar navigation. The sidebar navigation entries are dashboard, courses, users, enrollments, payments, reports, and discussions.

---

# Authentication System

The frontend admin uses JWT authentication.

The token is stored locally after successful login.

---

# Authentication Flow

```text
Admin Login Form
        │
        ▼
Axios Login Request
        │
        ▼
Backend Admin API
        │
        ▼
JWT Token Response
        │
        ▼
LocalStorage Token Storage
        │
        ▼
Protected Dashboard Access
```

---

# Login System

Responsibilities:

- Validate admin credentials
- Handle API login requests
- Store authentication token
- Redirect authenticated admin
- Handle invalid login states

---

# Protected Route System

Protected routes prevent unauthorized dashboard access.

Checks include:

- Token existence
- Token validity
- Authentication status

Unauthorized users are redirected to `/login`.

---

# Super Admin Authorization

Certain actions are restricted to super admins.

Examples include:

- Creating admins
- Deleting admins
- Updating admin permissions
- Managing platform level settings

---

# Layout System

The admin dashboard uses reusable layout architecture.

Main layout components:

- AdminSidebar
- Header
- Dashboard wrappers
- Mobile navigation
- Content containers

---

# Sidebar Architecture

The sidebar manages:

- Navigation
- Active page highlighting
- Mobile responsiveness
- Sidebar collapsing
- Route navigation

---

# Sidebar Navigation Flow

```text
Admin Clicks Sidebar Item
           │
           ▼
useNavigate()
           │
           ▼
Route Change
           │
           ▼
Page Component Render
```

---

# Header Component

The header controls:

- Search functionality
- Notification access
- Theme switching
- Admin profile
- Mobile sidebar toggle

---

# Dashboard System

The dashboard fetches enrollment statistics and displays metric cards for total users, total courses, enrollments, and total revenue. Detailed charts and activity graphs are not implemented; the page currently shows a “Platform Insights Coming Soon” placeholder.

---

# Dashboard Architecture

```text
Dashboard Page
      │
      ▼
Analytics Cards
      │
      ▼
Insights placeholder
      │
      ▼
`/api/admin/enrollments?type=stats`
```

---

# Course Management System

The course module handles:

- Course listing
- Course creation
- Course editing
- Course deletion

---

# Course Management Flow

```text
Courses Page
      │
      ▼
Fetch API requests through `src/utils/api.js`
      │
      ▼
Backend Course APIs
      │
      ▼
Course Table Rendering
```

---

# Course Creation System

The course builder supports:

- Add course titles
- Add descriptions
- Upload thumbnails
- Create lessons
- Add pricing
- Publish courses

---

# Course Editing System

Features:

- Update course content
- Replace thumbnails
- Modify pricing
- Edit lessons
- Manage publish status

---

# User Management System

The user module handles:

- User listing
- User searching
- User banning
- User deletion
- User status management

---

# User Moderation Workflow

```text
Admin Opens Users Page
          │
          ▼
Fetch User Data
          │
          ▼
Render User Table
          │
          ▼
Moderation Actions
```

---

# Enrollment System

The enrollment module displays:

- Purchased courses
- Enrollment dates
- Course completion
- User progress

---

# Payment Monitoring System

The payment module tracks:

- Payment history
- Revenue generation
- Transaction statuses
- Course purchases

---

# Report Moderation System

The report system manages community moderation.

The course editor supports:

- View reports
- Resolve reports
- Hide content
- Unhide content
- Moderate discussions

---

# Reports Workflow

```text
User Reports Content
         │
         ▼
Backend Stores Report
         │
         ▼
Frontend Admin Fetches Reports
         │
         ▼
Admin Moderates Content
```

---

# ReportsPage.jsx

Responsibilities:

- Fetch reports
- Render moderation tables
- Handle moderation actions
- Display moderation status

---

# Notification System

The notification system supports:

- Unread notifications
- Read notifications
- Clear notifications
- Notification dropdowns

---

# Notification Flow

```text
Backend Notification Event
           │
           ▼
Frontend Fetch Notifications
           │
           ▼
Notification Rendering
```

---

# Profile Management System

The profile page fetches and displays the current admin’s name, email, role, and avatar. Its profile fields and save controls are read-only/disabled; profile updates are not implemented in the frontend.

---

# Settings System

The settings page provides password-change controls. Super admins see an explanatory restricted-action state; other admins can submit the current and new password to the admin API.

---

# Input State Management

The admin dashboard uses controlled React inputs.

Advantages:

- Better form control
- State synchronization
- Validation support
- Dynamic rendering

---

# Theme System

The dashboard supports:

- Dark mode
- Theme persistence
- Dynamic UI switching

Theme settings are stored locally.

---

# API Communication Layer

The frontend admin communicates with the backend using the native Fetch API through the shared helper and Axios for the settings password-change request.

Responsibilities:

- GET requests
- POST requests
- PUT requests
- DELETE requests
- Authorization headers

---

# API Request Architecture

```text
Dashboard Components
         │
         ▼
Fetch helper or Axios
         │
         ▼
Backend Admin APIs
```

Most pages use `src/utils/api.js`, which calls the native Fetch API through the `/api` proxy and attaches the JWT when present. `SettingsPage.jsx` uses Axios directly for the password-change request.

---

# Authorization Headers

Authenticated requests include:

```text
Authorization: Bearer jwt_token
```

---

# Error Handling System

The frontend handles:

- Authentication failures
- API errors
- Validation errors
- Route errors
- Empty states

---

# Loading State System

The dashboard manages:

- Page loading
- API loading
- Table loading
- Form submission loading

Purpose:

Improve user experience during asynchronous operations.

---

# Toast Notification System

React Hot Toast is used for:

- Success notifications
- Error alerts
- Action confirmations
- API feedback

---

# Search System

Search functionality is implemented in:

- Courses page
- Users page
- Reports page
- Payments page

---

# Responsive Design System

The admin dashboard supports:

- Desktop layouts
- Tablet layouts
- Mobile layouts

Responsive techniques include:

- Tailwind breakpoints
- Mobile sidebar
- Adaptive grids
- Flexible layouts

---

# Tailwind CSS Architecture

The admin dashboard uses utility-first styling.

Advantages:

- Faster development
- Consistent UI
- Responsive design
- Reusable utilities

---

# Reusable Component Architecture

Reusable components include:

- Cards
- Tables
- Buttons
- Inputs
- Modals
- Loaders
- Dropdowns

---

# State Management Strategy

The admin dashboard primarily uses:

- useState
- useEffect
- useMemo
- useCallback

For scalable lightweight state management.

---

# Route Synchronization

The frontend synchronizes routes with pages.

Example routes:

```text
/dashboard
/courses
/users
/enrollments
/payments
/reports
/discussions
/profile
/settings
```

These are top-level paths; the app does not render every page under `/dashboard`.

Advantages:

- Better browser history
- Proper navigation
- Deep linking support
- Cleaner URLs

---

# Environment Variables

## Required Variables

```env
VITE_API_BASE_URL=http://localhost:5001
```

`vite.config.js` reads `VITE_API_BASE_URL` and proxies browser requests beginning with `/api` to that value. API helpers keep using relative `/api` paths, so the browser does not call the backend host directly during local development.

---

> **Repository-root workflow:** For normal development, use `npm run setup` and `npm run dev:frontend-admin` from the repository root. The runner verifies that the Admin API is healthy before starting Vite.

# Local Development Setup

## Install Dependencies

```bash
cd frontendAdmin
npm install
```

---

# Run Development Server

```bash
npm run dev
```

Application runs on:

```text
http://localhost:5174
```

---

# Backend Connection

The admin backend defaults to:

```text
http://localhost:5001
```

The checked-in `frontendAdmin/.env.example` currently contains `VITE_API_BASE_URL=http://localhost:5000`, which is the main backend port. For the admin panel, copy the file to `.env` and set `VITE_API_BASE_URL=http://localhost:5001` unless the admin API is intentionally configured on another port. The frontend dev server itself runs on `http://localhost:5174`.

---

# Vite Proxy Architecture

```text
Frontend Request
        │
        ▼
Vite Proxy
        │
        ▼
Backend Admin API
```

Purpose:

Prevent CORS issues during local development.

---

# Available npm Scripts

Run these from `frontendAdmin/`:

| Script | Purpose |
| ------ | ------- |
| `npm run dev` | Start the Vite development server on port 5174 |
| `npm run build` | Create the production build |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint |
| `npm run test` | Run the Vitest test suite once |

---

# Production Build

Build command:

```bash
npm run build
```

---

# Deployment Platforms

Frontend admin can be deployed on:

- Vercel
- Netlify
- Render
- Firebase Hosting

---

# Production Deployment Flow

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
Live Admin Dashboard
```

---

# Security Measures

## Protected Dashboard

Unauthorized users cannot access admin routes.

---

# JWT Security

JWT tokens secure all admin API requests.

---

# Role Based Authorization

Super admin permissions protect sensitive operations.

---

# Future Improvements

Potential future upgrades:

- Redux or Zustand
- React Query
- WebSocket notifications
- Real time analytics
- Audit logs
- Advanced reporting
- Automated testing
- Docker support
- Activity tracking
- SSR optimization

---

# Conclusion

The AI Mentor Frontend Admin system is a scalable and modular React based administrative dashboard designed for:

- Platform management
- Course administration
- User moderation
- Community moderation
- Analytics monitoring
- Secure admin workflows

The architecture separates responsibilities cleanly using reusable components, protected routes, modular layouts, and centralized API communication, making the system easier to maintain, extend, and scale for future development.
