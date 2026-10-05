# Contributing to AI Mentor

New to the project? Start here.

---

# 1. Fork the repository

First, fork the repository to your own GitHub account:

https://github.com/Deepak3699/Ai_Mentor

Click the **Fork** button in the top-right corner and create a fork under your GitHub account.

# 2. Clone your fork

Clone **your forked repository**, not the original repository:

    git clone https://github.com/<your-github-username>/Ai_Mentor.git
    cd Ai_Mentor

Replace `<your-github-username>` with your GitHub username.

# 3. Follow the detailed environment setup

    # Read initalSetup.md (Neon database + .env files)
    

# 4. Install dependencies for each service

    cd backend       && npm install && cd ..
    cd backendAdmin  && npm install && cd ..
    cd frontend      && npm install && cd ..
    cd frontendAdmin && npm install && cd ..

# 5. AI service (Python)

    cd ai_service
    python -m venv venv
    source venv/bin/activate          # Windows: venv\Scripts\activate
    pip install -r backend/requirements.txt
    cd ..


### Running everything (five separate terminals)

| # | Service | Command | URL |
|---|---|---|---|
| 1 | backend | `cd backend && npm run dev` | http://localhost:5000 |
| 2 | frontend | `cd frontend && npm run dev` | http://localhost:5173 |
| 3 | backendAdmin | `cd backendAdmin && npm run dev` | http://localhost:5001 |
| 4 | frontendAdmin | `cd frontendAdmin && npm run dev` | http://localhost:5174 |
| 5 | ai_service | `cd ai_service/backend && uvicorn api:app --reload --port 8000` | http://localhost:8000/docs |

**To create the first admin account:** `cd backendAdmin && npm run seed:superadmin`

---

## How to work on a task

```bash
# 1. Always start from the latest code
git checkout main
git pull origin main

# 2. Create your own branch
git checkout -b fix/short-description

# 3. Write code, run it locally, test it

# 4. Run the linter, otherwise CI will fail
npm run lint          # from the repo root — checks three services

# 5. Commit
git add .
git commit -m "fix: admin panel pointing to wrong port"

# 6. Push
git push origin fix/short-description

# 7. Open a pull request on GitHub
```

---

## Rules

### Do

- One pull request does one thing — keep it under roughly 400 changed lines
- Run the service locally before you push
- `npm run lint` must pass
- Attach screenshots for any UI change
- Use the commit format `type: description` (see below)
- Try on your own for 30 minutes before asking for help

### Do not

- Push directly to `main`
- Commit a `.env` file — ever
- Put API keys or passwords in the code
- Merge someone else's pull request without being asked
- Leave `console.log` statements behind
- Bundle five unrelated changes into one pull request

---

## Commit message format

```
type: short description (lowercase, present tense)
```

| Type | When to use it |
|---|---|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation only |
| `style` | Formatting, no logic change |
| `refactor` | Better code, same behaviour |
| `test` | Adding tests |
| `chore` | Dependencies or configuration |

Examples:

```
feat: add certificate download button
fix: point admin frontend to port 5001
docs: add backendAdmin setup to README
chore: bump express to v5
```

---

## Review process

1. Open your pull request and fill in the template
2. Automated checks run (lint and build, about three minutes)
3. Red cross? Click "Details", read the error, fix it, push again
4. Green checks plus one approval — then merge
5. Delete your branch after merging

---

## Project structure (five services)

```
Ai_Mentor/
├── frontend/        Learner app      React 19 + Vite + Tailwind      :5173
├── backend/         Main API         Express 4 + Sequelize + Postgres :5000
├── frontendAdmin/   Admin panel      React 19 + Vite + Tailwind      :5174
├── backendAdmin/    Admin API        Express 5 + Sequelize            :5001
└── ai_service/      AI video         FastAPI + Gemini + FFmpeg        :8000
```

`backend` and `backendAdmin` share the **same PostgreSQL database**.

---

## Stuck?

1. Try on your own first — give it 30 minutes and read the error carefully
2. Search Google or Stack Overflow with the exact error message
3. Still stuck? Ask in the team group, and include:
   - What you already tried
   - The full error message (screenshot or pasted text)
   - Which service and which file

Asking for help is fine. Just do not ask with "it is not working" — nobody can
help you from that alone.

---

## Further reading

- `initalSetup.md` — environment setup
- `backend/BACKEND_DOCUMENTATION.md` — the most detailed backend reference
- `ai_service/README.md` — the AI video pipeline

---

*Questions? Ask the team lead. If you spot a mistake in these rules, send a pull
request — this file should improve too.*
