# AI Mentor — Learning Platform

An AI-powered learning platform with learner and administrator applications, course management, analytics, community discussions, and AI-generated video lessons.

## Applications

| Application | Folder                | Local URL               |
| ----------- | --------------------- | ----------------------- |
| User API    | `backend/`            | `http://localhost:5000` |
| User WEB    | `frontend/`           | `http://localhost:5173` |
| Admin API   | `backendAdmin/`       | `http://localhost:5001` |
| Admin WEB   | `frontendAdmin/`      | `http://localhost:5174` |
| AI service  | `ai_service/backend/` | `http://localhost:8000` |

## Prerequisites

- Node.js 18+
- npm
- Python 3.10+
- PostgreSQL or a hosted PostgreSQL service
- FFmpeg for AI video generation

## Environment setup

Create the service `.env` files from their `.env.example` templates and add valid local credentials. Never commit `.env` files or secrets.

See [`initalSetup.md`](./initalSetup.md) for the complete environment-variable and first-time setup guide.

## Root development workflow

Run these commands from the repository root.

### Install project dependencies

```bash
npm run setup
```

This installs dependencies for the root workspace, `backend`, `frontend`, `backendAdmin`, `frontendAdmin`, and the Python AI service. Existing `.env` files and credentials are not created, changed, or printed.

### Start services

| Command                      | Services                                     |
| ---------------------------- | -------------------------------------------- |
| `npm run dev`                | User API, User WEB, Admin API, and Admin WEB |
| `npm run dev:user`           | User API and User WEB                        |
| `npm run dev:admin`          | Admin API and Admin WEB                      |
| `npm run dev:backend`        | User API only                                |
| `npm run dev:frontend`       | User WEB only; requires a healthy User API   |
| `npm run dev:backend-admin`  | Admin API only                               |
| `npm run dev:frontend-admin` | Admin WEB only; requires a healthy Admin API |

| Service    | URL                     |
| ---------- | ----------------------- |
| User API   | `http://localhost:5000` |
| User WEB   | `http://localhost:5173` |
| Admin API  | `http://localhost:5001` |
| Admin WEB  | `http://localhost:5174` |
| AI service | `http://localhost:8000` |

The terminal dashboard waits for backend readiness and a successful health response before starting each matching frontend. It shows independent startup timers, backend phase timings, clickable URLs, and separate User/Admin sections.

If a selected service is already healthy, the runner reuses it instead of starting a duplicate process. `Ctrl+C` stops only processes started by the current runner; reused services remain owned by the terminal that originally launched them.

The four Node/React services are managed by the root runner. The Python AI service remains a separate process:

```bash
cd ai_service/backend
python graceful_server.py
```

Runtime profile uploads are stored under `backend/uploads/` and are ignored by Git. Only `backend/uploads/.gitkeep` is tracked.

## Code formatting

The repository uses a project-local, exact version of Prettier so every developer and CI environment applies the same formatting rules.

```bash
npm run format
npm run format:check
```

`npm run format` rewrites supported files. `npm run format:check` validates formatting without changing files. Generated output, dependencies, environment files, runtime uploads, and media artifacts are excluded through `.prettierignore`.

## Validation

```bash
npm run lint
```

Run focused tests and builds for the service changed by your work. See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for branch, commit, testing, and pull-request rules.

## Detailed documentation

- [`initalSetup.md`](./initalSetup.md) — first-time environment setup
- [`backend/README.md`](./backend/README.md) — User API
- [`frontend/README.md`](./frontend/README.md) — User WEB
- [`backendAdmin/backendAdmin_Documentation.md`](./backendAdmin/backendAdmin_Documentation.md) — Admin API
- [`frontendAdmin/FRONTEND_ADMIN_DOCUMENTATION.md`](./frontendAdmin/FRONTEND_ADMIN_DOCUMENTATION.md) — Admin WEB
- [`ai_service/README.md`](./ai_service/README.md) — Python AI service

## About

This project was developed as part of an internship. All rights are reserved by the respective authors and organization.
