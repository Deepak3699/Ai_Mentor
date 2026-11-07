const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = process.cwd();
const npmCli = process.env.npm_execpath;
if (!npmCli) {
  console.error("[FAILED] npm executable path is unavailable.");
  process.exit(1);
}

const npmProjects = [".", "backend", "frontend", "backendAdmin", "frontendAdmin"];
const aiOnly = process.argv.includes("--ai-only");
const aiVenv = process.env.AI_SERVICE_VENV || join(root, "ai_service", ".venv");
const aiPython =
  process.platform === "win32"
    ? join(aiVenv, "Scripts", "python.exe")
    : join(aiVenv, "bin", "python");

function run(command, args, cwd, label, env = process.env) {
  console.log(`\n[INSTALL] ${label}`);
  const result = spawnSync(command, args, {
    cwd,
    env,
    stdio: "inherit",
    windowsHide: false,
  });
  if (result.error || result.status !== 0) {
    console.error(`[FAILED] ${label}`);
    if (result.error) console.error(result.error.message);
    process.exit(result.status || 1);
  }
  console.log(`[OK] ${label}`);
}

function findCommand(command) {
  const checker = process.platform === "win32" ? "where.exe" : "which";
  const result = spawnSync(checker, [command], { stdio: "ignore", windowsHide: true });
  return result.status === 0;
}

function requireTool(command, label) {
  if (!findCommand(command)) {
    console.error(`[FAILED] Missing required tool: ${label} (${command})`);
    process.exit(1);
  }
  console.log(`[OK] Tool available | ${label}`);
}

function validateEnvNames(file) {
  if (!existsSync(file)) {
    console.error(`[FAILED] Missing AI environment file: ${file}`);
    console.error(
      "[NEXT] Copy ai_service/backend/.env.example to ai_service/backend/.env and add GEMINI_API_KEY.",
    );
    process.exit(1);
  }
  const configured = new Set();
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && match[2] && !/^your_/i.test(match[2])) configured.add(match[1]);
  }
  if (!configured.has("GEMINI_API_KEY")) {
    console.error("[FAILED] GEMINI_API_KEY is not configured in ai_service/backend/.env");
    process.exit(1);
  }
  console.log("[OK] AI environment configured | GEMINI_API_KEY=<configured>");
  for (const optional of [
    "GROQ_API_KEY",
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET",
  ]) {
    if (configured.has(optional))
      console.log(`[OK] Optional AI setting | ${optional}=<configured>`);
  }
}

console.log("AI MENTOR | DEPENDENCY SETUP");
console.log("------------------------------------------------------------");
console.log("Installs Node applications and the isolated Python AI environment.");

requireTool("node", "Node.js");
requireTool("npm", "npm");
requireTool("python", "Python");
requireTool("ffmpeg", "FFmpeg");

if (!aiOnly) {
  for (const relative of npmProjects) {
    const cwd = join(root, relative);
    if (!existsSync(join(cwd, "package.json"))) continue;
    const npmArgs = existsSync(join(cwd, "package-lock.json"))
      ? [npmCli, "ci"]
      : [npmCli, "install"];
    run(process.execPath, npmArgs, cwd, `Node packages | ${relative === "." ? "root" : relative}`);
  }
} else {
  console.log("[INFO] AI-only setup selected; Node dependency installation skipped.");
}

if (!existsSync(aiPython)) {
  run("python", ["-m", "venv", aiVenv], root, `Create AI virtual environment | ${aiVenv}`);
} else {
  console.log(`\n[OK] AI virtual environment reused | ${aiVenv}`);
}

const requirements = join(root, "ai_service", "backend", "requirements.txt");
if (!existsSync(requirements)) {
  console.error(`[FAILED] Missing AI requirements: ${requirements}`);
  process.exit(1);
}
const pythonEnv = { ...process.env };
run(
  aiPython,
  ["-m", "pip", "install", "--upgrade", "pip"],
  root,
  "Upgrade AI environment pip",
  pythonEnv,
);
run(
  aiPython,
  ["-m", "pip", "install", "-r", requirements],
  root,
  "Install AI service packages",
  pythonEnv,
);

validateEnvNames(join(root, "ai_service", "backend", ".env"));
run(
  aiPython,
  [
    "-c",
    "import fastapi, uvicorn, dotenv, google.genai, groq, cloudinary, cachetools, mutagen; import api; print('[OK] AI imports loaded')",
  ],
  join(root, "ai_service", "backend"),
  "Validate AI service imports",
  pythonEnv,
);

if (process.platform === "win32") {
  const redis = spawnSync("powershell.exe", [
    "-NoProfile",
    "-Command",
    "if (Get-NetTCPConnection -LocalPort 6379 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }",
  ]);
  if (redis.status === 0) console.log("[OK] Redis-compatible service available | port=6379");
  else
    console.warn(
      "[WARN] Redis is not listening on port 6379. Video jobs require Redis or Memurai.",
    );
}

console.log("\n[READY] All detected project dependencies and the AI environment are installed.");
console.log("[NEXT] Run: npm run dev");
