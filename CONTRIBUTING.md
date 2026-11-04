# Contributing

Please read and understand this guide carefully before contributing to AI Mentor. It outlines the steps to prepare, validate, and submit your changes effectively.

## Table of contents

- [Get started](#get-started)
- [First-time contributor checklist](#first-time-contributor-checklist)
- [Starting services via root commands](#starting-services-via-root-commands)
- [Contributor service map and responsibilities](#contributor-service-map-and-responsibilities)
  - [1. `frontend/` — Learner Web Application](#1-frontend--learner-web-application)
  - [2. `backend/` — User API and AI Gateway](#2-backend--user-api-and-ai-gateway)
  - [3. `frontendAdmin/` — Administrator Web Application](#3-frontendadmin--administrator-web-application)
  - [4. `backendAdmin/` — Administrator API](#4-backendadmin--administrator-api)
  - [5. `ai_service/` — AI Video and Lesson Microservice](#5-ai_service--ai-video-and-lesson-microservice)
  - [Quick "Start Here" service directory and commands table](#quick-start-here-service-directory-and-commands-table)
  - [Root orchestration vs. direct service commands](#root-orchestration-vs-direct-service-commands)
- [Make changes](#make-changes)
- [Validate your changes](#validate-your-changes)
- [Commit messages](#commit-messages)
- [Submit a pull request](#submit-a-pull-request)
- [AI use policy and guidelines](#ai-use-policy-and-guidelines)
- [Security](#security)

## Get started

1. Fork [Deepak3699/Ai_Mentor](https://github.com/Deepak3699/Ai_Mentor) and clone your fork:

   ```bash
   git clone https://github.com/<your-username>/Ai_Mentor.git
   cd Ai_Mentor
   ```

2. Add the original repository as the `upstream` remote:

   ```bash
   git remote add upstream https://github.com/Deepak3699/Ai_Mentor.git
   git remote -v
   ```

3. Keep your local base branch up to date with upstream. Fetch and integrate the latest changes daily, and always do this before starting new work. Replace `<base-branch>` with the branch you are contributing against, such as `main` or `dev`:

   ```bash
   git fetch upstream
   git switch <base-branch>
   git pull --ff-only upstream <base-branch>
   git push origin <base-branch>
   ```

   If the fast-forward update fails, your local branch may have diverged. Resolve that before continuing; do not force-push to the upstream repository.

4. Install project dependencies:

   ```bash
   npm run setup
   ```

5. Configure the required environment variables using the `.env.example` files and [`initalSetup.md`](initalSetup.md). Never commit `.env` files or credentials.

---

### First-time contributor checklist

Follow this checklist to get from a fresh repository clone to a fully functional local development stack:

- [ ] **1. Verify Prerequisites**:
  - **Node.js**: version 18 or newer (Node.js 20 recommended)
  - **npm**: installed with Node.js
  - **Python**: version 3.10 or newer (Python 3.11 recommended)
  - **PostgreSQL**: local instance or hosted connection string (e.g. Neon)
  - **Redis**: local Redis or Memurai listening on port `6379` (required for asynchronous video generation jobs)
  - **FFmpeg**: installed and discoverable on your system `PATH` (required for AI video rendering)
  - **Git**: installed and configured
- [ ] **2. Clone & Add Upstream**:
  - Clone your fork and link the main repository as `upstream`:
    ```bash
    git clone https://github.com/<your-username>/Ai_Mentor.git
    cd Ai_Mentor
    git remote add upstream https://github.com/Deepak3699/Ai_Mentor.git
    ```
- [ ] **3. Configure Environment Files**:
  - Copy `.env.example` to `.env` in all five runtime locations as documented in `initalSetup.md`:
    - `backend/.env`
    - `frontend/.env`
    - `backendAdmin/.env`
    - `frontendAdmin/.env`
    - `ai_service/backend/.env`
- [ ] **4. Install Dependencies**:
  - From the repository root, run the setup orchestrator:
    ```bash
    npm run setup
    ```
  - _(This installs dependencies across the root and all four Node apps, creates `ai_service/.venv`, installs `requirements.txt`, and validates tool paths)._
- [ ] **5. Start Local Services**:
  - Run `npm run dev` to boot all five services simultaneously, or use `npm run dev:user` / `npm run dev:admin` to launch a targeted subset.
- [ ] **6. Quality Checks Before Submitting**:
  - Before committing or pushing, verify that your code conforms to project standards:
    ```bash
    npm run lint          # Run ESLint across all JavaScript/React packages
    npm run format:check  # Check Prettier code style
    ```

---

### Starting services via root commands

From the repository root:

```bash
npm run setup          # Full installation (Node apps + Python venv)
npm run setup:ai       # AI-only installation
```

Then start the stack using the root orchestration runner:

```bash
npm run dev            # Start or reuse all 5 services with unified dashboard
npm run dev:user       # User API (:5000) + Learner Web (:5173)
npm run dev:admin      # Admin API (:5001) + Admin Web (:5174)
npm run dev:ai         # Python AI Service only (:8000)
```

Target individual services from root with:

- `npm run dev:backend` (User API)
- `npm run dev:frontend` (Learner Web)
- `npm run dev:backend-admin` (Admin API)
- `npm run dev:frontend-admin` (Admin Web)

The root runner checks backend health (`/health`) before starting frontends and safely reuses healthy services already running in other terminal windows. `Ctrl+C` cleanly stops only processes started by the active terminal runner.

---

## Contributor service map and responsibilities

AI Mentor is organized as five cooperating runtime services sharing one PostgreSQL database and coordinated through root development scripts.

```text
Ai_Mentor/
├── frontend/        Learner Web Application     React 19 + Vite 7 + Tailwind 4      :5173
├── backend/         User API & AI Gateway        Express 5 + Sequelize 6 + Postgres  :5000
├── frontendAdmin/   Administrator Web Portal     React 19 + Vite 7 + Tailwind 4      :5174
├── backendAdmin/    Administrator API            Express 5 + Sequelize 6 + Postgres  :5001
└── ai_service/      AI Video & Lesson Service    FastAPI + Gemini + TTS + FFmpeg     :8000
```

`backend` and `backendAdmin` share the **same PostgreSQL database**. The User API (`backend`) acts as the application-facing bridge and security boundary to the Python `ai_service`.

### 1. `frontend/` — Learner Web Application

- **Directory**: `frontend/`
- **Local URL**: [http://localhost:5173](http://localhost:5173)
- **Primary Tech**: React 19, Vite 7, Tailwind CSS 4, React Router DOM v7, Axios, Lucide React, Recharts, i18next
- **Responsibilities & Intent**:
  - The primary student-facing learning portal.
  - User authentication with email/password and Firebase Google OAuth sign-in.
  - Course discovery catalog, course previews, and checkout (Stripe and Razorpay integration).
  - Learning workspace (`/learning/:id`) with video player, subtitle toggling, and real-time transcript synchronization.
  - Learner analytics dashboard (`/analytics`) featuring course progress, completion breakdown donut charts, and task calendar.
  - Community discussion boards, bookmarks, watched-video history, and profile settings.
  - Automatically redirects authenticated administrators to the `frontendAdmin` portal.

### 2. `backend/` — User API and AI Gateway

- **Directory**: `backend/`
- **Local URL**: [http://localhost:5000](http://localhost:5000) (`http://localhost:5000/health` for health status)
- **Primary Tech**: Node.js, Express 5, Sequelize 6, PostgreSQL, JWT, BullMQ, Redis, Zod, Firebase Admin
- **Responsibilities & Intent**:
  - Core REST API serving the learner application.
  - Learner authentication, JWT issuance, password reset workflows, and user profile management.
  - Course catalog queries, module metadata, and student enrollment records.
  - Payment authorization and webhook listeners for Stripe and Razorpay.
  - Background asynchronous video generation queue processing (BullMQ backed by Redis).
  - Secure gateway and proxy between the frontend and the Python `ai_service`.

### 3. `frontendAdmin/` — Administrator Web Application

- **Directory**: `frontendAdmin/`
- **Local URL**: [http://localhost:5174](http://localhost:5174)
- **Primary Tech**: React 19, Vite 7, Tailwind CSS 4, React Router DOM v7, Axios, Lucide React, ExcelJS, jsPDF
- **Responsibilities & Intent**:
  - Dedicated management portal for instructors, admins, and super-administrators.
  - Course authoring, syllabus composition, module ordering, and publishing state management.
  - User account moderation (viewing learners, updating roles, banning, unblocking, and account deletion).
  - Platform enrollment metrics, revenue analytics, and report export tools (CSV, Excel, PDF).
  - Community moderation and reported course resolution.

### 4. `backendAdmin/` — Administrator API

- **Directory**: `backendAdmin/`
- **Local URL**: [http://localhost:5001](http://localhost:5001) (`http://localhost:5001/health` for health status)
- **Primary Tech**: Node.js, Express 5, Sequelize 6, PostgreSQL, JWT, Zod
- **Responsibilities & Intent**:
  - Role-protected API for administrator and super-administrator workflows.
  - Shares the underlying PostgreSQL database with `backend` while isolating administrative privilege checks.
  - Transactional syllabus and course operations with rollback safety.
  - Admin audit trails, course reporting handlers, and administrative notifications.

### 5. `ai_service/` — AI Video and Lesson Microservice

- **Directory**: `ai_service/backend/`
- **Local URL**: [http://127.0.0.1:8000](http://127.0.0.1:8000) (`/` for health, `/docs` for interactive Swagger UI)
- **Primary Tech**: Python 3.10+, FastAPI, Uvicorn, Google Gemini (`google-genai`), Groq, Edge TTS (`edge-tts`), FFmpeg, Cloudinary
- **Responsibilities & Intent**:
  - Generates structured educational lesson scripts using Google Gemini (with Groq fallback).
  - Synthesizes narration audio from scripts using Edge TTS.
  - Composes video slides, narration audio, and animated subtitles via FFmpeg.
  - Delivers generated media to Cloudinary (with local storage fallback) and cleans up temporary local files.
  - Generates course syllabi, quizzes, flashcards, and transcripts.

---

### Quick "Start Here" service directory and commands table

| Service Name      | Directory             | Local URL / Port        | Root Orchestration Command   | Direct Service Command                               | Intent / Primary Function                        |
| :---------------- | :-------------------- | :---------------------- | :--------------------------- | :--------------------------------------------------- | :----------------------------------------------- |
| **Learner Web**   | `frontend/`           | `http://localhost:5173` | `npm run dev:frontend`       | `cd frontend && npm run dev`                         | Learner portal, course player, analytics         |
| **User API**      | `backend/`            | `http://localhost:5000` | `npm run dev:backend`        | `cd backend && npm run dev`                          | Main learner API & AI service gateway            |
| **Admin Web**     | `frontendAdmin/`      | `http://localhost:5174` | `npm run dev:frontend-admin` | `cd frontendAdmin && npm run dev`                    | Admin management portal & reports                |
| **Admin API**     | `backendAdmin/`       | `http://localhost:5001` | `npm run dev:backend-admin`  | `cd backendAdmin && npm run dev`                     | Role-protected admin & course API                |
| **AI Service**    | `ai_service/backend/` | `http://127.0.0.1:8000` | `npm run dev:ai`             | `cd ai_service/backend && python graceful_server.py` | FastAPI video/audio generation & syllabus engine |
| **All Services**  | Root (`.`)            | Ports 5000–8000         | `npm run dev`                | _N/A (use root runner)_                              | Spawns all 5 services with unified dashboard     |
| **Learner Stack** | Root (`.`)            | Ports 5000 & 5173       | `npm run dev:user`           | _N/A (use root runner)_                              | Spawns User API + Learner Web                    |
| **Admin Stack**   | Root (`.`)            | Ports 5001 & 5174       | `npm run dev:admin`          | _N/A (use root runner)_                              | Spawns Admin API + Admin Web                     |

---

### Root orchestration vs. direct service commands

Understanding when to run commands from the repository root versus inside a specific service directory will save you time and prevent common setup issues:

#### Root Orchestration Commands (Recommended for everyday development)

- **Where to run**: Repository root (`Ai_Mentor/`).
- **How they work**: Implemented via `scripts/dev-runner.cjs` and `scripts/install-dependencies.cjs`.
- **Key benefits**:
  - **Coordinated startup**: Frontends wait for their matching backend `/health` endpoint before starting, eliminating connection errors on launch.
  - **Port awareness & reuse**: Detects whether a service is already running on its port in another terminal or background process and reuses it without failing.
  - **Safe cleanup**: `Ctrl+C` cleanly shuts down only the processes started by that specific terminal session.
  - **Unified tooling**:
    - `npm run setup`: Installs dependencies for root, all four Node apps, creates the Python virtual environment (`ai_service/.venv`), and checks system prerequisites (Node, npm, Python, FFmpeg, Redis).
    - `npm run lint`: Runs ESLint across `backend`, `backendAdmin`, `frontend`, and `frontendAdmin` in a single pass.
    - `npm run format`: Runs project-pinned Prettier across all markdown, code, and config files.
    - `npm test`: Runs all service test suites in sequence.

#### Direct Service Commands (For focused, deep debugging)

- **Where to run**: Inside the individual service folder (`cd frontend`, `cd backend`, etc.).
- **When to use**:
  - Inspecting raw, unbuffered server logs without the multi-app dashboard.
  - Running service-specific database migrations or seeds:
    - `backend/`: `npm run seed:courses` (populate sample course catalog).
    - `backendAdmin/`: `npm run seed:superadmin` (seed default super-administrator).
  - Running single-app test runners during active development:
    - `frontend/`: `npm test` or `npx vitest run`.
    - `frontendAdmin/`: `npm test` (Vitest).
    - `backendAdmin/`: `npm run test:postgres-rollback` (transaction rollback integration tests).
    - `ai_service/`: `pytest` (using `ai_service/.venv`).

---

## Make changes

- Create a descriptive branch from the updated base branch, such as `feat/course-search` or `fix/login-validation`.
- Keep each change focused and consistent with the conventions of the service you are editing.
- Include or update tests and documentation when relevant.
- Avoid unrelated formatting changes and generated files.

## Validate your changes

Run the checks relevant to your changes before opening a pull request:

```bash
npm run format:check
npm run lint
npm test
```

For AI service changes, run the Python tests from `ai_service/`:

```bash
cd ai_service
python -m pytest
```

For frontend changes, run the production build for the affected application:

```bash
npm run build --prefix frontend
npm run build --prefix frontendAdmin
```

If a check cannot be run, explain why in your pull request. Confirm that your changes do not include credentials, environment files, generated media, or build output.

## Commit messages

Use short, descriptive commit messages in the `type: description` format:

```text
feat: add course search
fix: handle expired login tokens
docs: update setup instructions
test: cover course enrollment
```

Common types include `feat`, `fix`, `docs`, `test`, `refactor`, and `chore`. Keep commits coherent and avoid combining unrelated changes.

## Submit a pull request

A pull request (PR) presents your proposed changes for review. A clear description and a focused, well-tested change help reviewers understand your work and make review more efficient.

Before submitting:

1. Write code that is clear and consistent with the surrounding project.
2. Organize your work into coherent commits that make the change easy to follow.
3. Review your own changes for correctness, scope, and accidental files.
4. Run the relevant tests, linters, formatters, and builds.
5. Open a PR against the appropriate project branch.

In your PR description:

- Summarize the problem and the reason for the change.
- Explain the approach and any important design decisions.
- Mention differences from the original plan, if applicable.
- Call out open questions or areas where you would like reviewer input.
- Include screenshots or recordings for user-facing changes. For UI changes, show the relevant updated screens and note any important interaction changes.
- List the checks you ran and their results. Be accurate about anything you did not test.

Use GitHub Markdown to keep the description easy to read. Put questions about specific code in a review comment on the relevant lines when possible. Respond to feedback constructively and update the PR description if the scope or validation changes.

## AI use policy and guidelines

AI tools may help you understand the codebase, write code, or improve wording. You are responsible for every change you submit, whether or not you used an AI tool. You must understand the changes, explain why they are appropriate, and verify them with relevant tests. Do not submit AI-generated code that you have not personally reviewed and tested.

### Using AI as a coding assistant

- Become familiar with the relevant part of the project before asking an AI tool to suggest or change code.
- Verify AI-generated explanations against project documentation and source code. AI tools can be wrong about how the project works.
- Treat generated code, commands, and recommendations as suggestions. Check their correctness, compatibility, security, and behavior before using them.
- Break work into focused, reviewable changes and coherent commits, even if a tool produces a large change at once.
- Avoid comments that merely restate what the code already makes clear. Keep necessary comments concise and accurate.

### Using AI for project communication

Use your own judgment and words when communicating with maintainers. AI tools may help with spelling, grammar, or translation, but read and verify all generated text before posting it. Do not paste generic AI-generated responses to review feedback; explain your reasoning directly.

PR descriptions should focus on the motivation, important design choices, and validation rather than repeating details already visible in the diff. Keep communication concise and accurate, and complete any PR template without replacing its checklist or requested information with generated text.

## Security

Never commit passwords, API keys, tokens, private keys, or other sensitive information. If a real secret is exposed, rotate it with the relevant provider and notify the maintainers. Do not report security vulnerabilities in public issues; contact the project maintainers privately.

For local setup and project-service details, see [`README.md`](README.md) and [`initalSetup.md`](initalSetup.md).
