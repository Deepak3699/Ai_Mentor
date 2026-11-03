# Issue #546 — Documentation Drift Audit

**Issue:** [#546 — Audit repository documentation against runtime behavior](https://github.com/Deepak3699/Ai_Mentor/issues/546)  
**Branch:** `docs/546-documentation-drift-audit`  
**Audit scope:** Documentation review only. No application code or configuration was changed.

## Executive summary

The documentation broadly describes the repository's five-service architecture and the root development workflow correctly. The audit found several places where instructions conflict with the checked-in configuration or inspected runtime code. The most important fixes are to correct the database environment-variable name in the backend guide, clarify payment-provider requirements, correct the admin frontend API URL example, and align contributor instructions with the root development runner.

This report separates confirmed mismatches from completeness and clarity recommendations. It does not treat a missing description as proof that runtime behavior is broken.

## Findings

### Medium impact

#### 1. Backend documentation uses the wrong database variable name

- **Documents:** `backend/BACKEND_DOCUMENTATION.md`
- **Evidence:** The guide's environment section identifies `NEON_DATABASE_URL`, but its Database Setup and local setup instructions tell contributors to set `DATABASE_URL`.
- **Runtime evidence:** `backend/.env.example` defines `NEON_DATABASE_URL`; `backend/config/db.js` reads `process.env.NEON_DATABASE_URL`.
- **Impact:** A contributor following the `DATABASE_URL` instructions may configure a variable the backend does not read, causing database connection setup to fail or fall back to local database settings.
- **Recommendation:** Use `NEON_DATABASE_URL` consistently in every backend setup example. If `DATABASE_URL` is intentionally supported elsewhere, document the exact code path; the inspected `backend/config/db.js` uses `NEON_DATABASE_URL`.

#### 2. Setup guide gives conflicting instructions about payment credentials

- **Document:** `initalSetup.md`
- **Evidence:** One section says Stripe and Razorpay credentials are required and that the server crashes if they are absent; a later section says feature-specific variables may be omitted and the server can start without them.
- **Runtime evidence:** `backend/env-validator.js` associates payment variables with `DISABLE_STRIPE` and `DISABLE_RAZORPAY`. In development, missing values produce warnings and startup continues. In production, validation exits when required credentials for enabled integrations are missing or placeholders. The disable flags skip the corresponding validation. Payment operations can still fail at request time if the selected provider has no usable credentials.
- **Impact:** New contributors may believe they must configure payment providers even when they are not working on payment functionality, or may incorrectly assume missing credentials are safe in production.
- **Recommendation:** Explain the development and production behavior separately. State that valid credentials are needed for each enabled provider; document the disable flags for local development when payment features are not being tested.

#### 3. Contributor guide describes a separate AI-service startup as the normal workflow

- **Document:** `CONTRIBUTING.md`
- **Evidence:** It instructs contributors to start the Python AI service separately with `cd ai_service/backend` and `python graceful_server.py`.
- **Runtime/documentation evidence:** The root `package.json` provides `npm run dev` and `npm run dev:ai`; the root README and `ai_service/README.md` describe the root runner as the normal workflow and direct Python startup as focused debugging.
- **Impact:** Contributors may start a second AI process unnecessarily or follow a workflow inconsistent with the repository's coordinated runner.
- **Recommendation:** Make `npm run dev` (all services) and `npm run dev:ai` (AI service only) the normal documented options. Retain direct Python startup only in a clearly labelled debugging section.

#### 4. Admin frontend sample points to the user API instead of the admin API

- **Documents/configuration:** `frontendAdmin/FRONTEND_ADMIN_DOCUMENTATION.md`, `frontendAdmin/.env.example`
- **Evidence:** The documentation says the admin frontend should use `http://localhost:5001`, but the checked-in `.env.example` sets `VITE_API_BASE_URL=http://localhost:5000`.
- **Runtime evidence:** `backendAdmin/server.js` defaults to port `5001`; `frontendAdmin/vite.config.js` proxies API requests to the configured `VITE_API_BASE_URL`.
- **Impact:** A contributor who copies the sample environment file unchanged may send admin UI requests to the learner/user backend rather than the admin backend.
- **Recommendation:** Change the sample value to `http://localhost:5001`, or explicitly document why a different deployment topology should use port 5000.

#### 5. Admin frontend documentation overstates course and lesson editing capabilities

- **Document:** `frontendAdmin/FRONTEND_ADMIN_DOCUMENTATION.md`
- **Evidence:** The course-management section describes course editing/update and manual lesson creation/editing.
- **Runtime evidence:** The inspected admin UI and `backendAdmin/routes/adminRoutes.js` expose course creation, status updates, deletion, enrollment viewing, syllabus/learning retrieval, and AI syllabus generation. The inspected `CourseBuilderModal.jsx` fetches learning content and can request AI syllabus generation; it does not expose manual lesson create/edit controls. The inspected admin routes do not include general course-update or lesson CRUD endpoints.
- **Impact:** Admin users and contributors may expect controls and API operations that are not present in the inspected implementation.
- **Recommendation:** Rewrite the feature description to match the verified operations. Clearly distinguish AI syllabus generation from manual lesson or course-content editing. Re-audit if additional routes or UI controls are added later.

### Low impact

#### 6. Admin backend guide asks contributors to install an existing dependency manually

- **Document:** `backendAdmin/backendAdmin_Documentation.md`
- **Evidence:** The guide instructs contributors to run `npm i helmet`.
- **Runtime evidence:** `backendAdmin/package.json` already lists `helmet` as a dependency, and `backendAdmin/config/securityHeaders.js` imports it.
- **Impact:** The extra installation step is redundant and can create unnecessary dependency-management noise.
- **Recommendation:** Remove the manual `npm i helmet` instruction; the normal `npm install` step installs it.

#### 7. Admin backend documentation omits health endpoints

- **Document:** `backendAdmin/backendAdmin_Documentation.md`
- **Evidence:** The guide's API reference does not list the health endpoints.
- **Runtime evidence:** `backendAdmin/server.js` exposes `GET /health`; `backendAdmin/routes/healthRoutes.js` exposes `GET /health/live` and `GET /health/ready`. The readiness endpoint checks the database connection.
- **Impact:** Operators and contributors may overlook useful health checks when diagnosing startup or deployment issues.
- **Recommendation:** Add these endpoints to the API reference and explain the difference between basic health, liveness, and database readiness.

#### 8. AI lesson video architecture page is too high-level to serve as an implementation reference

- **Document:** `docs/AI_LESSON_VIDEO_ARCHITECTURE.md`
- **Evidence:** The page provides a short end-to-end overview but does not explain important operational details covered elsewhere, such as queued generation/status tracking, provider fallback, asset storage/rendering paths, or failure handling.
- **Impact:** Readers must consult other documentation to understand how the pipeline works in practice.
- **Recommendation:** Either expand this page with links and a concise explanation of the operational flow, or label it as a high-level overview and link prominently to `docs/AI_LESSON_GENERATION_FLOW.md`.

#### 9. AI lesson generation flow table of contents does not include its final section

- **Document:** `docs/AI_LESSON_GENERATION_FLOW.md`
- **Evidence:** The table of contents lists sections 1–11, while the document also contains section 12, “Important implementation caveats.”
- **Impact:** Minor navigation inconsistency.
- **Recommendation:** Add section 12 to the table of contents.

#### 10. Root README repository tree omits the `docs/` directory

- **Document:** `README.md`
- **Evidence:** The repository tree does not show the `docs/` directory, although the README links to documentation in that directory.
- **Impact:** Minor discoverability issue for readers browsing the repository layout.
- **Recommendation:** Include `docs/` in the tree, with its key architecture documents.

## Clarifications and items not classified as defects

- **Manual startup order vs. root runner:** `initalSetup.md` says to start the user backend before the admin backend. The root runner coordinates service startup and health checks. These instructions can both be valid in different workflows; clarify that the ordering applies to manual, service-by-service startup.
- **Root service inventory and ports:** The root README's five-service inventory and listed default ports (5173, 5000, 5174, 5001, 8000) broadly align with the inspected package scripts and service configuration.
- **Root scripts:** The README's documented root setup/development commands broadly align with the root `package.json` scripts inspected during the audit.
- **AI-service setup:** `ai_service/README.md` correctly describes the root runner as the normal local workflow and direct Python startup as a debugging option.
- **Windows console tree characters:** Garbled tree symbols seen in Command Prompt output may be a terminal code-page display issue; this audit did not treat that output alone as evidence that the README file itself is corrupted.

## Suggested fix order

1. Correct `NEON_DATABASE_URL` references in the backend guide.
2. Resolve the payment credential contradiction in `initalSetup.md`.
3. Correct the admin frontend `.env.example` API target.
4. Update `CONTRIBUTING.md` to reflect the root runner.
5. Align the admin course/lesson feature documentation with the inspected routes and UI.
6. Apply the low-impact navigation, dependency, health-endpoint, and architecture-page improvements.

## Audit limitations

- This is a documentation drift audit based on the documentation, configuration, scripts, and source files inspected for issue #546.
- It is not a full test run, security review, or exhaustive endpoint-by-endpoint verification of every documented feature.
- Findings describe documentation mismatches or omissions; they do not by themselves establish a production incident.
- No source code, runtime configuration, or existing documentation was modified as part of the audit. This report is the only proposed deliverable.
