const { existsSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = process.cwd();
const npmCli = process.env.npm_execpath;
if (!npmCli) {
  console.error("[FAILED] npm executable path is unavailable.");
  process.exit(1);
}

const npmProjects = [
  ".",
  "backend",
  "frontend",
  "backendAdmin",
  "frontendAdmin",
];

function run(command, args, cwd, label) {
  console.log(`\n[INSTALLING] ${label}`);
  const result = spawnSync(command, args, {
    cwd,
    env: process.env,
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

console.log("AI MENTOR · DEPENDENCY SETUP");
console.log("────────────────────────────────────────────────────────");
console.log(
  "Installs Node dependencies for every application and Python AI-service requirements.",
);

for (const relative of npmProjects) {
  const cwd = join(root, relative);
  if (!existsSync(join(cwd, "package.json"))) continue;
  const npmArgs = existsSync(join(cwd, "package-lock.json"))
    ? [npmCli, "ci"]
    : [npmCli, "install"];
  run(
    process.execPath,
    npmArgs,
    cwd,
    `Node packages · ${relative === "." ? "root" : relative}`,
  );
}

const requirements = join(root, "ai_service", "backend", "requirements.txt");
if (existsSync(requirements)) {
  if (process.platform === "win32") {
    run(
      "py",
      ["-3.14", "-m", "pip", "install", "-r", requirements],
      root,
      "Python packages · ai_service (Python 3.14)",
    );
  } else {
    run(
      "python3",
      ["-m", "pip", "install", "-r", requirements],
      root,
      "Python packages · ai_service",
    );
  }
}

console.log("\n[READY] All detected project dependencies are installed.");
console.log("[NEXT] Run: npm run dev");
