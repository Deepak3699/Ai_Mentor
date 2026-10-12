const REQUIRED_ENV_VARS = [
  // ── AI Service ─────────────────────────────────────────────────────────────
  {
    key: "AI_SERVICE_KEY",
    hint: "Shared key for AI service-to-service authentication",
    group: "AI Service",
  },

  // ── Database ──────────────────────────────────────────────────────────────
  {
    key: "NEON_DATABASE_URL",
    hint: "Neon PostgreSQL connection string (or configure local DB_* variables)",
    group: "Database",
    optionalIf: () => Boolean(process.env.DB_NAME || process.env.DB_HOST),
  },

  // ── Auth ──────────────────────────────────────────────────────────────────
  {
    key: "JWT_SECRET",
    hint: "Secret key used to sign JWT tokens (use a long random string)",
    group: "Auth",
  },

  // ── Frontend Admin ────────────────────────────────────────────────────────
  {
    key: "FRONTEND_ADMIN_URL",
    hint: "Frontend Admin dashboard URL for CORS (e.g. http://localhost:5174)",
    group: "Frontend",
  },
];

const PLACEHOLDER_PATTERNS = [
  /^your_/i,
  /^your-/i,
  /^<.+>$/,
  /^placeholder/i,
  /^changeme/i,
  /^xxx/i,
];

// ── ANSI colours ─────────────────────────────────────────────────────────────
const RED    = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN  = "\x1b[32m";
const BOLD   = "\x1b[1m";
const DIM    = "\x1b[2m";
const RESET  = "\x1b[0m";

export function validateEnv() {
  const missing      = [];
  const placeholders = [];

  for (const { key, hint, group, optionalIf } of REQUIRED_ENV_VARS) {
    if (optionalIf && optionalIf()) {
      continue;
    }
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
  process.stdout.write(`${BOLD}${YELLOW}══════════════════════════════════════════════════${RESET}\n`);
  process.stdout.write(`${BOLD}${YELLOW}  ⚠  Environment Variable Warning — BackendAdmin${RESET}\n`);
  process.stdout.write(`${BOLD}${YELLOW}══════════════════════════════════════════════════${RESET}\n\n`);

  // ── Missing vars ─────────────────────────────────────────────────────────
  if (missing.length > 0) {
    process.stdout.write(`${BOLD}${RED}Missing variable${missing.length > 1 ? "s" : ""}:${RESET}\n`);
    for (const { key, hint, group } of missing) {
      process.stdout.write(`  ${RED}✖ ${BOLD}${key}${RESET}  ${DIM}[${group}]${RESET}\n`);
      process.stdout.write(`    ${DIM}→ ${hint}${RESET}\n`);
    }
    process.stdout.write("\n");
  }

  // ── Placeholder vars ─────────────────────────────────────────────────────
  if (placeholders.length > 0) {
    process.stdout.write(`${BOLD}${YELLOW}Placeholder value${placeholders.length > 1 ? "s" : ""} detected:${RESET}\n`);
    for (const { key, hint, group } of placeholders) {
      process.stdout.write(`  ${YELLOW}⚠ ${BOLD}${key}${RESET}${YELLOW} still has a placeholder value  ${DIM}[${group}]${RESET}\n`);
      process.stdout.write(`    ${DIM}→ Replace it with your real ${hint}${RESET}\n`);
    }
    process.stdout.write("\n");
  }

  // ── How to fix ───────────────────────────────────────────────────────────
  process.stdout.write(`${DIM}How to fix:${RESET}\n`);
  process.stdout.write(`  ${DIM}1. Copy .env.example to .env  →  cp .env.example .env${RESET}\n`);
  process.stdout.write(`  ${DIM}2. Open .env and fill in every value listed above${RESET}\n`);
  process.stdout.write(`  ${DIM}3. Restart the server${RESET}\n\n`);

  process.stdout.write(`${BOLD}${YELLOW}⚠  Server is starting anyway — some features may not work correctly.${RESET}\n\n`);
}
