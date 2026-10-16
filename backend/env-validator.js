const REQUIRED_ENV_VARS = [
  // ── Database ──────────────────────────────────────────────────────────────
  {
    key: "NEON_DATABASE_URL",
    hint: "Neon PostgreSQL connection string (e.g. postgresql://user:pass@host/db)",
    group: "Database",
  },

  // ── Auth ──────────────────────────────────────────────────────────────────
  {
    key: "JWT_SECRET",
    hint: "Secret key used to sign JWT tokens (use a long random string)",
    group: "Auth",
  },

  // ── Cloudinary — disable with DISABLE_CLOUDINARY=true ───────────────────
  {
    key: "CLOUDINARY_CLOUD_NAME",
    hint: "Cloudinary cloud name from your dashboard",
    group: "Cloudinary",
    disableFlag: "DISABLE_CLOUDINARY",
  },
  {
    key: "CLOUDINARY_API_KEY",
    hint: "Cloudinary API key from your dashboard",
    group: "Cloudinary",
    disableFlag: "DISABLE_CLOUDINARY",
  },
  {
    key: "CLOUDINARY_API_SECRET",
    hint: "Cloudinary API secret from your dashboard",
    group: "Cloudinary",
    disableFlag: "DISABLE_CLOUDINARY",
  },

  // ── Email (SMTP) — disable with DISABLE_EMAIL=true ───────────────────────
  {
    key: "SMTP_HOST",
    hint: "SMTP server host (e.g. smtp.gmail.com)",
    group: "Email",
    disableFlag: "DISABLE_EMAIL",
  },
  {
    key: "SMTP_PORT",
    hint: "SMTP server port (e.g. 587 or 465)",
    group: "Email",
    disableFlag: "DISABLE_EMAIL",
  },
  {
    key: "SMTP_USER",
    hint: "SMTP login email address",
    group: "Email",
    disableFlag: "DISABLE_EMAIL",
  },
  {
    key: "SMTP_PASS",
    hint: "SMTP login password or app password",
    group: "Email",
    disableFlag: "DISABLE_EMAIL",
  },
  {
    key: "FROM_EMAIL",
    hint: "Sender email address shown to recipients",
    group: "Email",
    disableFlag: "DISABLE_EMAIL",
  },
  {
    key: "FROM_NAME",
    hint: "Sender name shown to recipients (e.g. AI Mentor)",
    group: "Email",
    disableFlag: "DISABLE_EMAIL",
  },

  // ── Frontend ──────────────────────────────────────────────────────────────
  {
    key: "FRONTEND_URL",
    hint: "Frontend URL for CORS (e.g. http://localhost:5173)",
    group: "Frontend",
  },

  // ── Stripe — disable with DISABLE_STRIPE=true ────────────────────────────
  {
    key: "STRIPE_SECRET_KEY",
    hint: "Stripe secret key from your Stripe dashboard (starts with sk_test_ or sk_live_)",
    group: "Stripe",
    disableFlag: "DISABLE_STRIPE",
  },
  {
    key: "STRIPE_WEBHOOK_SECRET",
    hint: "Stripe webhook secret from your Stripe dashboard (starts with whsec_)",
    group: "Stripe",
    disableFlag: "DISABLE_STRIPE",
  },

  // ── Razorpay — disable with DISABLE_RAZORPAY=true ────────────────────────

  {
    key: "RAZORPAY_KEY_ID",
    hint: "RAZORPAY KEY ID from your Razorpay Dashboard -> Account & Settings -> Api keys (sart with rzp_test_ )",
    group: "Razorpay",
    disableFlag: "DISABLE_RAZORPAY",
  },
  {
    key: "RAZORPAY_KEY_SECRET",
    hint: "RAZORPAY KEY SECRET from your Razorpay Dashboard -> Account & Settings -> Api keys",
    group: "Razorpay",
    disableFlag: "DISABLE_RAZORPAY",
  },
];

const PLACEHOLDER_PATTERNS = [
  /^your_/i,
  /^your-/i,
  /^<.+>$/,
  /^placeholder/i,
  /^changeme/i,
  /^xxx/i,
  /^rzp_test_your_key_here$/i,
];

// ── ANSI colours ─────────────────────────────────────────────────────────────
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

export function validateEnv() {
  const missing = [];
  const placeholders = [];

  for (const { key, hint, group, disableFlag } of REQUIRED_ENV_VARS) {
    // Skip optional integrations that have been explicitly disabled
    if (disableFlag && process.env[disableFlag] === "true") continue;
    const value = process.env[key];
    if (!value || value.trim() === "") {
      missing.push({ key, hint, group });
    } else if (PLACEHOLDER_PATTERNS.some((re) => re.test(value.trim()))) {
      placeholders.push({ key, hint, group });
    }
  }

  // ── All good ────────────────────────────────────────────────────────────
  if (missing.length === 0 && placeholders.length === 0) {
    console.log(`${GREEN}${BOLD}✔  All environment variables are set correctly.${RESET}`);
    return;
  }

  // ── Print warning banner ─────────────────────────────────────────────────
  process.stdout.write("\n");
  process.stdout.write(
    `${BOLD}${YELLOW}══════════════════════════════════════════════════${RESET}\n`,
  );
  process.stdout.write(`${BOLD}${YELLOW}  ⚠  Environment Variable Warning — Backend${RESET}\n`);
  process.stdout.write(
    `${BOLD}${YELLOW}══════════════════════════════════════════════════${RESET}\n\n`,
  );

  // ── Missing vars ─────────────────────────────────────────────────────────
  if (missing.length > 0) {
    process.stdout.write(
      `${BOLD}${RED}Missing variable${missing.length > 1 ? "s" : ""}:${RESET}\n`,
    );
    for (const { key, hint, group } of missing) {
      process.stdout.write(`  ${RED}✖ ${BOLD}${key}${RESET}  ${DIM}[${group}]${RESET}\n`);
      process.stdout.write(`    ${DIM}→ ${hint}${RESET}\n`);
    }
    process.stdout.write("\n");
  }

  // ── Placeholder vars ─────────────────────────────────────────────────────
  if (placeholders.length > 0) {
    process.stdout.write(
      `${BOLD}${YELLOW}Placeholder value${placeholders.length > 1 ? "s" : ""} detected:${RESET}\n`,
    );
    for (const { key, hint, group } of placeholders) {
      process.stdout.write(
        `  ${YELLOW}⚠ ${BOLD}${key}${RESET}${YELLOW} still has a placeholder value  ${DIM}[${group}]${RESET}\n`,
      );
      process.stdout.write(`    ${DIM}→ Replace it with your real ${hint}${RESET}\n`);
    }
    process.stdout.write("\n");
  }

  // ── How to fix ───────────────────────────────────────────────────────────
  process.stdout.write(`${DIM}How to fix:${RESET}\n`);
  process.stdout.write(`  ${DIM}1. Copy .env.example to .env  →  cp .env.example .env${RESET}\n`);
  process.stdout.write(`  ${DIM}2. Open .env and fill in every value listed above${RESET}\n`);
  process.stdout.write(
    `  ${DIM}3. Optional integrations can be skipped: DISABLE_CLOUDINARY=true,${RESET}\n`,
  );
  process.stdout.write(
    `  ${DIM}   DISABLE_EMAIL=true, DISABLE_STRIPE=true, DISABLE_RAZORPAY=true${RESET}\n`,
  );
  process.stdout.write(`  ${DIM}4. Restart the server${RESET}\n\n`);

  // ── Fail in production; warn in development ──────────────────────────────
  if (process.env.NODE_ENV === "production") {
    process.stdout.write(
      `${BOLD}${RED}✖  Server startup aborted. Fix the configuration above before running in production.${RESET}\n\n`,
    );
    process.exit(1);
  } else {
    process.stdout.write(
      `${BOLD}${YELLOW}⚠  Server is starting anyway (development) — some features may not work correctly.${RESET}\n\n`,
    );
  }
}
