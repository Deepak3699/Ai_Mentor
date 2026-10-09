# AI Mentor — Initial Setup

Follow these steps **in order**. Do not change any application code yet.

## 0. What you are setting up

AI Mentor is **five separate applications** that run at the same time. You need
all five for the full product.

| # | Service | Folder | What it is | Port | URL |
|---|---|---|---|---|---|
| 1 | **backend** | `backend/` | Main API — auth, courses, payments, community | 5000 | http://localhost:5000 |
| 2 | **frontend** | `frontend/` | Learner web app | 5173 | http://localhost:5173 |
| 3 | **backendAdmin** | `backendAdmin/` | Admin API | 5001 | http://localhost:5001 |
| 4 | **frontendAdmin** | `frontendAdmin/` | Admin dashboard | 5174 | http://localhost:5174 |
| 5 | **ai_service** | `ai_service/` | Python service that generates AI lesson videos | 8000 | http://localhost:8000/docs |

**Important:** `backend` and `backendAdmin` connect to the **same database**.
`backend` creates the tables when it starts; `backendAdmin` does not. So
**always start `backend` before `backendAdmin`.**

---

## 1. Prerequisites

Check these before you begin.

| Requirement | How to check | Where to get it |
|---|---|---|
| **Node.js 18+** | `node -v` | https://nodejs.org |
| **npm** | `npm -v` | Comes with Node |
| **Python 3.10+** | `python --version` or `python3 --version` | https://python.org — on Windows, tick **Add Python to PATH** during install |
| **PostgreSQL 14+** *or* a Neon account | `psql --version` | https://postgresql.org or https://neon.tech |
| **FFmpeg** | `ffmpeg -version` | Windows: `winget install ffmpeg` · macOS: `brew install ffmpeg` · Linux: `sudo apt install ffmpeg` |
| **Git** | `git --version` | https://git-scm.com |

> **FFmpeg is required.** Without it the AI video service cannot merge audio
> and video. Restart your terminal after installing it.

---

## 2. Get the code

```bash
git clone https://github.com/Deepak3699/Ai_Mentor.git
cd Ai_Mentor
```

---

## 3. Set up the database (pick one)

### Option A — Neon (recommended, no local install)

1. Sign up at https://neon.tech
2. Create a project named `AI Mentor`, region **Singapore**
3. Copy the **connection string** from *Connection Details*

It looks like this:

```
postgresql://neondb_owner:xxxxx@ep-xxxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
```

Keep it safe. **Never commit it to GitHub.**

### Option B — Local PostgreSQL

1. Install PostgreSQL and start the server
2. Create a database:

```bash
psql -U postgres
CREATE DATABASE ai_mentor;
\q
```

If you use this option, fill in `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` and
`DB_PASSWORD` in `backend/.env` and `backendAdmin/.env`, and **leave
`NEON_DATABASE_URL` empty**.

---

## 4. Create the five `.env` files

Each service has a template called `.env.example`. Copy each one to `.env`.

Run this from the repository root:

```bash
cp backend/.env.example            backend/.env
cp frontend/.env.example           frontend/.env
cp backendAdmin/.env.example       backendAdmin/.env
cp frontendAdmin/.env.example      frontendAdmin/.env
cp ai_service/backend/.env.example ai_service/backend/.env
```

> **Note the AI service path.** The file lives at
> `ai_service/backend/.env.example`, **not** `ai_service/.env.example`.

Your structure should now look like this:

```
Ai_Mentor/
├── backend/
│   ├── .env.example
│   └── .env                  <- you created this
├── frontend/
│   ├── .env.example
│   └── .env                  <- you created this
├── backendAdmin/
│   ├── .env.example
│   └── .env                  <- you created this
├── frontendAdmin/
│   ├── .env.example
│   └── .env                  <- you created this
└── ai_service/
    └── backend/
        ├── .env.example
        └── .env              <- you created this
```

---

## 5. Fill in the environment variables

### 5.1 `backend/.env` — the important one

**These five are required. The server will not start without them.**

| Variable | What to put | Where to get it |
|---|---|---|
| `NEON_DATABASE_URL` | Your Neon connection string | Neon console → Connection Details |
| `JWT_SECRET` | Any long random string, e.g. `a8f3k2m9x7q1w5e4r6t8y0u2i4o6p` | Make one up — keep it private |
| `STRIPE_SECRET_KEY` | Test key, starts with `sk_test_` | https://dashboard.stripe.com/test/apikeys |
| `RAZORPAY_KEY_ID` | Test key, starts with `rzp_test_` | https://dashboard.razorpay.com/app/keys |
| `RAZORPAY_KEY_SECRET` | Test secret | Same Razorpay page |

> Verified by testing: if `STRIPE_SECRET_KEY` is missing the server crashes with
> `Missing STRIPE_SECRET_KEY environment variable`, and if the Razorpay keys are
> missing it crashes with `Missing Razorpay environment variables`. Both payment
> providers are required even if you never use them.

**These are needed for specific features.** The server will start without them,
but the feature will not work:

| Variable | Needed for | Where to get it |
|---|---|---|
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Image and video uploads | https://cloudinary.com/console |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `FROM_EMAIL`, `FROM_NAME` | Password reset emails | Gmail → Account → Security → 2-Step Verification → App Passwords |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Google login | Firebase console → Project settings → Service accounts → Generate new private key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhooks | Stripe CLI: `stripe listen` prints it |
| `AI_SERVICE_URL` | AI video generation | Leave as `http://127.0.0.1:8000` |
| `FRONTEND_URL` | CORS | Leave as `http://localhost:5173` |

Leave `PORT=5000` and `AI_SERVICE_URL=http://127.0.0.1:8000` as they are.

### 5.2 `frontend/.env`

| Variable | Value |
|---|---|
| `VITE_API_BASE_URL` | `http://localhost:5000` |
| `VITE_FIREBASE_API_KEY` | Firebase console → Project settings → Web app config |
| `VITE_FIREBASE_AUTH_DOMAIN` | e.g. `your-project.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | e.g. `your-project` |
| `VITE_FIREBASE_STORAGE_BUCKET` | e.g. `your-project.appspot.com` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Numeric ID from Firebase |
| `VITE_FIREBASE_APP_ID` | From Firebase |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe **publishable** key, starts with `pk_test_` |
| `VITE_RAZORPAY_KEY_ID` | Same value as in `backend/.env` |

> The first **seven** variables are mandatory. Vite refuses to start the dev
> server if any of them is missing or still says `your_...`.

### 5.3 `backendAdmin/.env`

| Variable | Value |
|---|---|
| `PORT` | `5001` |
| `FRONTEND_ADMIN_URL` | `http://localhost:5174` |
| `AI_SERVICE_URL` | `http://127.0.0.1:8000` |
| `JWT_SECRET` | Use the **same** value as in `backend/.env` |
| `NEON_DATABASE_URL` | The **same** connection string as `backend/.env` |
| `SUPER_ADMIN_NAME` | Your name |
| `SUPER_ADMIN_EMAIL` | The email you will log in with |
| `SUPER_ADMIN_PASSWORD` | A strong password — remember it |

### 5.4 `frontendAdmin/.env`

```env
VITE_API_BASE_URL=http://localhost:5001
```

> The admin API runs on **5001**. Keep this value unchanged or the admin
> dashboard will not load its data.

### 5.5 `ai_service/backend/.env`

| Variable | Where to get it |
|---|---|
| `GEMINI_API_KEY` | https://aistudio.google.com/app/apikey — free tier available |
| `GROQ_API_KEY` | https://console.groq.com/keys — free tier available |
| `CLOUDINARY_CLOUD_NAME` | Same as `backend/.env` |
| `CLOUDINARY_API_KEY` | Same as `backend/.env` |
| `CLOUDINARY_API_SECRET` | Same as `backend/.env` |

> **All five are required.** `config.py` raises an error and the service will
> not start if `GEMINI_API_KEY`, `GROQ_API_KEY` or any Cloudinary value is
> missing. Gemini is the primary AI provider; Groq is the fallback.

---

## 6. Install dependencies

Run each of these from the repository root.

```bash
# Node services
cd backend       && npm install && cd ..
cd frontend      && npm install && cd ..
cd backendAdmin  && npm install && cd ..
cd frontendAdmin && npm install && cd ..

# Python service
cd ai_service
python -m venv venv
source venv/bin/activate          # Windows PowerShell: .\venv\Scripts\Activate.ps1
                                  # Windows CMD:        .\venv\Scripts\activate.bat
pip install -r backend/requirements.txt
cd ..
```

> **Note:** `frontend/` has no `package-lock.json` in the repository, so
> `npm install` is correct there. The other three Node services have lock
> files and can also use `npm ci`. (Tracked as issue #14.)

On Windows, if the virtual environment fails to activate in PowerShell, run:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

---

## 7. Start the services

Open **five terminals**, or use your editor's split terminal. **Start them in
this order** — `backend` must come first because it creates the database tables.

| Order | Service | Command |
|---|---|---|
| 1 | backend | `cd backend && npm run dev` |
| 2 | frontend | `cd frontend && npm run dev` |
| 3 | backendAdmin | `cd backendAdmin && npm run dev` |
| 4 | frontendAdmin | `cd frontendAdmin && npm run dev` |
| 5 | ai_service | `cd ai_service/backend && python graceful_server.py` |

> **The AI service must be started from `ai_service/backend`, not from
> `ai_service`.** The code imports `config` directly and loads `.env` from the
> current directory, so running it from the parent folder will fail.

If you closed the Python virtual environment, reactivate it before step 5:

```bash
source ai_service/venv/bin/activate      # Windows: ai_service\venv\Scripts\activate
```

---

## 8. Create your first admin account

```bash
cd backendAdmin
npm run seed:superadmin
```

This creates the admin using the `SUPER_ADMIN_NAME`, `SUPER_ADMIN_EMAIL` and
`SUPER_ADMIN_PASSWORD` from `backendAdmin/.env`.

Load the included courses into a new, empty development database:
```bash
cd backend
npm run seed:courses
```
The normal command seeds only an empty course database. If courses already exist,
it exits successfully without deleting or duplicating data. Destructive reset mode
is reserved for maintainers and must never be used on shared, staging, or production
databases.

---

## 9. Verify that everything works

Check each one. If a step fails, see the troubleshooting table below.

| Check | How | Expected result |
|---|---|---|
| Backend is up | Open http://localhost:5000 | `✅ API is running...` |
| Backend connected to the database | Look at the backend terminal | `✅ Connected to Neon PostgreSQL using Sequelize` then `✅ Database models synced` |
| Env vars are valid | Look at the backend terminal | `✔ All environment variables are set correctly.` |
| Learner app loads | Open http://localhost:5173 | The login page appears |
| Admin API is up | Open http://localhost:5001/health | `{"message":"Backend Admin Server is running"}` |
| Admin panel loads | Open http://localhost:5174 | The admin login page appears |
| Admin login works | Log in with your super admin email and password | You reach the dashboard and see data |
| AI service is up | Open http://localhost:8000 | `{"message":"AI Lesson Generator Backend Running"}` |
| AI service docs | Open http://localhost:8000/docs | The Swagger UI appears |

### Test the full flow once

1. Open http://localhost:5173
2. Sign up with an email and password
3. Complete your profile (bio and avatar)
4. Browse a course and open its preview
5. Log in to http://localhost:5174 as the admin and confirm the new user shows
   up under Users

---

## 10. Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `Missing STRIPE_SECRET_KEY environment variable` | `STRIPE_SECRET_KEY` not set | Add it to `backend/.env` — even a test key will do |
| `Missing Razorpay environment variables: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET` | Razorpay keys not set | Add both to `backend/.env` |
| `Environment Variable Error — Frontend` and Vite exits | A `VITE_` variable is missing or still says `your_...` | Check `frontend/.env` against section 5.2 |
| `Unable to connect: ... SequelizeConnectionRefusedError` | Database not reachable | Check `NEON_DATABASE_URL`. For local Postgres, confirm the server is running |
| `❌ GEMINI_API_KEY not found in .env` | Wrong `.env` location or empty value | The file must be `ai_service/backend/.env` |
| `❌ GROQ_API_KEY not found in .env` | Groq key missing | Get a free key at https://console.groq.com/keys |
| `❌ Cloudinary credentials missing.` | One of the three Cloudinary values is empty | All three must be set |
| `ModuleNotFoundError: No module named 'config'` | Started uvicorn from `ai_service/` instead of `ai_service/backend/` | `cd ai_service/backend` first |
| `FFmpeg not found` | FFmpeg not installed or not on PATH | Install it and restart your terminal |
| `Port 5173 is already in use` | Something is already running | Stop it, or close the other process |
| `Not allowed by CORS` in the browser console | `FRONTEND_URL` does not match the browser address | In `backend/.env`, set `FRONTEND_URL=http://localhost:5173` |
| Admin panel loads but every page is empty | `VITE_API_BASE_URL` points to 5000 | Set it to `http://localhost:5001` in `frontendAdmin/.env` and restart Vite |
| Google login does nothing | Firebase keys missing or invalid | Check `FIREBASE_PRIVATE_KEY` in `backend/.env` — it must keep the `\n` characters |
| PowerShell blocks the venv activation | Execution policy | `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser` |

---

## 11. Final checklist

Tick every box before you move on to real work.

- [ ] Node 18+, Python 3.10+, FFmpeg and Git installed
- [ ] Database created (Neon project, or local `ai_mentor` database)
- [ ] `backend/.env` created with `NEON_DATABASE_URL`, `JWT_SECRET`, `STRIPE_SECRET_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`
- [ ] `frontend/.env` created with the API URL and all six Firebase values
- [ ] `backendAdmin/.env` created with the **same** database URL and JWT secret
- [ ] `frontendAdmin/.env` created with `VITE_API_BASE_URL=http://localhost:5001`
- [ ] `ai_service/backend/.env` created with Gemini, Groq and Cloudinary keys
- [ ] `npm install` run in backend, frontend, backendAdmin and frontendAdmin
- [ ] Python venv created and `requirements.txt` installed
- [ ] All five services started, in the correct order
- [ ] http://localhost:5000 shows `✅ API is running...`
- [ ] http://localhost:5001/health reports the server is running
- [ ] http://localhost:8000/docs opens
- [ ] Admin seeded with `npm run seed:superadmin`
- [ ] Included courses seeded once with `npm run seed:courses` on the new empty database
- [ ] Logged in to both the learner app and the admin panel
- [ ] No `.env` file appears in `git status`

---

## 12. Rules

- **Never commit a `.env` file.** Only `.env.example` files belong in git.
  Run `git status` before every commit. If a `.env` shows up, you have a problem.
- **Never paste an API key into the group chat, a PR, or a screenshot.**
- Ask before changing application code during setup.

---



**Setup taking longer than expected? Send the error message or a screenshot to
your team lead before changing anything manually.**
