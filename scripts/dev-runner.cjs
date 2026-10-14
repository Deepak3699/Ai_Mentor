const { spawn } = require("node:child_process");
const http = require("node:http");

const npmCli = process.env.npm_execpath;
if (!npmCli) {
  console.error("[FAILED] npm executable path is unavailable.");
  process.exit(1);
}

const mode = process.argv[2] || "all";
const modeServices = {
  all: ["userApi", "userWeb", "adminApi", "adminWeb", "aiApi"],
  user: ["userApi", "userWeb"],
  admin: ["adminApi", "adminWeb"],
  backend: ["userApi"],
  frontend: ["userWeb"],
  "backend-admin": ["adminApi"],
  "frontend-admin": ["adminWeb"],
  ai: ["aiApi"],
};
if (!modeServices[mode]) {
  console.error(`[FAILED] Unknown development mode: ${mode}`);
  process.exit(1);
}

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
};
const services = {
  userApi: {
    group: "USER APPLICATION",
    label: "API",
    folder: "backend",
    url: "http://localhost:5000",
    health: "http://localhost:5000/health",
    ready: "[READY] Backend:",
    color: C.cyan,
  },
  userWeb: {
    group: "USER APPLICATION",
    label: "WEB",
    folder: "frontend",
    url: "http://localhost:5173",
    backend: "userApi",
    ready: "[READY] Frontend:",
    color: C.magenta,
  },
  adminApi: {
    group: "ADMIN APPLICATION",
    label: "API",
    folder: "backendAdmin",
    url: "http://localhost:5001",
    health: "http://localhost:5001/health",
    ready: "[READY] Admin backend:",
    color: C.blue,
  },
  adminWeb: {
    group: "ADMIN APPLICATION",
    label: "WEB",
    folder: "frontendAdmin",
    url: "http://localhost:5174",
    backend: "adminApi",
    ready: "[READY] Admin frontend:",
    color: C.yellow,
  },
  aiApi: {
    group: "AI SERVICE",
    label: "API",
    folder: "ai_service/backend",
    url: "http://127.0.0.1:8000",
    health: "http://127.0.0.1:8000/",
    ready: "Application startup complete.",
    color: C.green,
    command: "python",
  },
};
const selected = modeServices[mode];
const state = Object.fromEntries(
  Object.keys(services).map((key) => [
    key,
    {
      status: selected.includes(key) ? (services[key].backend ? "waiting" : "starting") : "idle",
      detail: services[key].backend
        ? `Waiting for ${services[services[key].backend].group.replace(" APPLICATION", "")} API`
        : "Starting process",
      runStartedAt: null,
      elapsed: null,
      phases: {},
    },
  ]),
);
const children = new Map();
const externallyRunning = new Set();
const healthChecks = new Map();
let stopping = false;
let frame = 0;
let renderedLines = 0;
let animation = null;
let finalShown = false;
const interactive = Boolean(process.stdout.isTTY && !process.env.NO_COLOR);
const READY_TIMEOUT_MS = 120000;
const ansi =
  /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d\/#&.:=?%@~_]+)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;
const stripAnsi = (value) => value.replace(ansi, "").trimEnd();

const orbit = [0, 1, 2, 5, 8, 7, 6, 3];
function lattice(status) {
  if (status === "ready") return `${C.green}✓${C.reset}       `;
  if (status === "failed") return `${C.red}✕${C.reset}       `;
  if (status === "waiting" || status === "idle") return `${C.gray}○○○ ○·○ ○○○${C.reset}`;
  const cells = Array(9).fill(`${C.gray}○${C.reset}`);
  cells[4] = `${C.gray}·${C.reset}`;
  cells[orbit[frame % orbit.length]] = `${C.bold}●${C.reset}`;
  cells[orbit[(frame + 7) % orbit.length]] = "•";
  return `${cells.slice(0, 3).join("")} ${cells.slice(3, 6).join("")} ${cells.slice(6).join("")}`;
}
function formatDuration(ms) {
  return `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
}
function timingLabel(key) {
  const data = state[key];
  if (externallyRunning.has(key)) return "Already running";
  if (data.runStartedAt == null) return "Not started";
  const duration = data.elapsed ?? Date.now() - data.runStartedAt;
  if (data.status === "ready") return `Ready in ${formatDuration(duration)}`;
  if (data.status === "failed") return `Failed after ${formatDuration(duration)}`;
  return `${formatDuration(duration)} elapsed`;
}
function beginStartupCycle(key) {
  state[key].runStartedAt = Date.now();
  state[key].elapsed = null;
  state[key].phases = {};
}
function title() {
  if (mode === "all") return "AI MENTOR | ALL SERVICES";
  if (mode === "user") return "AI MENTOR | USER APPLICATION";
  if (mode === "admin") return "AI MENTOR | ADMIN APPLICATION";
  if (mode === "ai") return "AI MENTOR | AI SERVICE";
  return `AI MENTOR | ${services[selected[0]].group.replace(" APPLICATION", "")} ${services[selected[0]].label}`;
}
function statusWord(status) {
  return {
    starting: "STARTING",
    checking: "CHECKING",
    waiting: "WAITING",
    ready: "READY",
    restarting: "RESTARTING",
    failed: "FAILED",
    idle: "IDLE",
  }[status];
}
function markPhase(key, name, event = "start") {
  const phases = state[key].phases;
  const now = Date.now();
  phases[name] ??= {};
  if (event === "start" && phases[name].startedAt == null) phases[name].startedAt = now;
  if (event === "end" && phases[name].endedAt == null) {
    phases[name].startedAt ??= state[key].runStartedAt ?? now;
    phases[name].endedAt = now;
  }
}
function phaseDuration(key, name) {
  const phase = state[key].phases[name];
  if (!phase?.startedAt || !phase?.endedAt) return null;
  return `${((phase.endedAt - phase.startedAt) / 1000).toFixed(1)}s`;
}
function phaseSummary(key) {
  if (services[key].label !== "API" || state[key].status !== "ready") return null;
  const parts = [
    ["DB Connect", phaseDuration(key, "database")],
    [key === "aiApi" ? "Startup" : "Schema", phaseDuration(key, "schema")],
    ["Health", phaseDuration(key, "health")],
  ].filter(([, value]) => value);
  return parts.length
    ? `${"".padEnd(22)}${parts.map(([label, value]) => `${label} ${value}`).join("  |  ")}`
    : null;
}
function aiPythonPath() {
  const configured = process.env.AI_SERVICE_PYTHON;
  const localVenv = "ai_service\\.venv\\Scripts\\python.exe";
  const candidates = [configured, localVenv, "python"].filter(Boolean);
  return candidates.find(
    (candidate) => candidate === "python" || require("node:fs").existsSync(candidate),
  );
}

function commandFor(key) {
  if (key !== "aiApi") return { executable: process.execPath, args: [npmCli, "run", "dev"] };
  const python = aiPythonPath();
  if (!python)
    throw new Error(
      "AI service Python environment not found. Run npm run setup:ai or set AI_SERVICE_PYTHON.",
    );
  return { executable: python, args: ["graceful_server.py"] };
}

function servicePrefix(key) {
  if (services[key].group === "USER APPLICATION") return "USER";
  if (services[key].group === "ADMIN APPLICATION") return "ADMIN";
  return "AI";
}

function serviceUrl(key) {
  // Keep the full protocol so VS Code recognizes this as a clickable terminal URL.
  return services[key].url;
}

function readyFooter(allReady) {
  if (!allReady) {
    return [
      `${C.dim}Live startup status${C.reset}`,
      `${C.dim}Press Ctrl+C to stop services started by this terminal.${C.reset}`,
    ];
  }

  const ownedCount = children.size;
  const reusedCount = externallyRunning.size;

  if (ownedCount === 0 && reusedCount > 0) {
    return [
      `${C.green}${C.bold}EXISTING SERVICES ARE HEALTHY${C.reset}`,
      "This terminal started no process. Stop services from the terminal that originally launched them.",
    ];
  }

  if (reusedCount > 0) {
    return [
      `${C.green}${C.bold}SELECTED SERVICES ARE READY${C.reset}`,
      "Ctrl+C stops only services started by this terminal. Reused services remain running.",
    ];
  }

  return [
    `${C.green}${C.bold}ALL SELECTED SERVICES ARE READY${C.reset}`,
    "Per-cycle readiness times are shown above. Press Ctrl+C to stop.",
  ];
}

function serviceRow(key, statusColor) {
  const service = services[key];
  const data = state[key];
  const mark = lattice(data.status).padEnd(10);
  const role = service.label.padEnd(4);
  const status = statusWord(data.status).padEnd(11);
  const detail = data.detail.padEnd(36);
  return `  ${mark} ${service.color}${role}${C.reset} ${statusColor}${status}${C.reset}${detail}${C.dim}${timingLabel(key).padStart(20)}${C.reset}`;
}

function dashboardLines() {
  const lines = [
    `${C.bold}${title()}${C.reset}`,
    `${C.gray}────────────────────────────────────────────────────────────────────${C.reset}`,
  ];
  const groups = [...new Set(selected.map((key) => services[key].group))];
  for (const group of groups) {
    lines.push(`${C.bold}${group}${C.reset}`);
    for (const key of selected.filter((item) => services[item].group === group)) {
      const service = services[key];
      const data = state[key];
      const statusColor =
        data.status === "ready"
          ? C.green
          : data.status === "failed"
            ? C.red
            : data.status === "waiting"
              ? C.gray
              : service.color;
      lines.push(serviceRow(key, statusColor));
      const phases = phaseSummary(key);
      if (phases) lines.push(`${C.dim}${phases}${C.reset}`);
    }
    if (group !== groups.at(-1)) lines.push("");
  }
  lines.push(
    `${C.gray}────────────────────────────────────────────────────────────────────${C.reset}`,
  );
  const allReady = selected.every((key) => state[key].status === "ready");
  lines.push(...readyFooter(allReady));
  return lines;
}
function clearDashboard() {
  if (!interactive || renderedLines === 0) return;
  process.stdout.write(`\x1b[${renderedLines}A`);
  for (let i = 0; i < renderedLines; i += 1) process.stdout.write("\x1b[2K\x1b[1B");
  process.stdout.write(`\x1b[${renderedLines}A`);
  renderedLines = 0;
}
function render() {
  if (stopping || !interactive) return;
  clearDashboard();
  const lines = dashboardLines();
  process.stdout.write(`${lines.join("\n")}\n`);
  renderedLines = lines.length;
  frame += 1;
}
function log(key, text, target = process.stdout) {
  const clean = stripAnsi(text).trim();
  if (!clean) return;
  if (
    /^> .*@.* (dev|start)$|^> (nodemon server\.js|vite)$|^\[nodemon\]|^(VITE v|➜\s*(Local|Network|press h))|Console Ninja|Database connected successfully|injected env/.test(
      clean,
    )
  )
    return;
  if (/^\[INFO\] (Allowed frontend origins|Keep this terminal open|HMR update means)/.test(clean))
    return;
  if (clean.includes(services[key].ready)) return;
  clearDashboard();
  target.write(
    `${services[key].color}[${servicePrefix(key)}/${services[key].label}]${C.reset} ${clean}\n`,
  );
  render();
}
function setState(key, status, detail) {
  const current = state[key];
  current.status = status;
  current.detail = detail;
  if ((status === "ready" || status === "failed") && current.elapsed == null) {
    current.elapsed = current.runStartedAt == null ? 0 : Date.now() - current.runStartedAt;
  }
  render();
}
function checkHealth(url) {
  return new Promise((resolve) => {
    const request = http.get(url, { timeout: 2500 }, (response) => {
      response.resume();
      resolve(response.statusCode >= 200 && response.statusCode < 500);
    });
    request.on("timeout", () => {
      request.destroy();
      resolve(false);
    });
    request.on("error", () => resolve(false));
  });
}
async function waitForLiveBackend(apiKey) {
  if (healthChecks.has(apiKey)) return healthChecks.get(apiKey);
  const task = (async () => {
    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (!stopping && Date.now() < deadline) {
      if (state[apiKey].status !== "checking") return false;
      if (await checkHealth(services[apiKey].health)) return true;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return false;
  })().finally(() => healthChecks.delete(apiKey));
  healthChecks.set(apiKey, task);
  return task;
}
function stream(streamValue, key, target, onLine) {
  let pending = "";
  streamValue.on("data", (chunk) => {
    pending += chunk.toString();
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() || "";
    for (const raw of lines) {
      Promise.resolve(onLine(stripAnsi(raw))).catch((error) => failService(key, error.message));
      log(key, raw, target);
    }
  });
}
function spawnService(key) {
  if (children.has(key) || state[key].status === "ready") return;
  const service = services[key];
  beginStartupCycle(key);
  markPhase(key, "process", "start");
  setState(key, "starting", service.label === "API" ? "Launching backend" : "Launching Vite");
  const command = commandFor(key);
  const child = spawn(command.executable, command.args, {
    cwd: service.folder,
    env: process.env,
    stdio: ["inherit", "pipe", "pipe"],
    windowsHide: false,
  });
  children.set(key, child);
  const onLine = async (text) => {
    if (text.includes("[nodemon] restarting due to changes")) {
      beginStartupCycle(key);
      markPhase(key, "process", "start");
      setState(key, "restarting", "Source changed");
    }
    if (text.includes("[CHECK] Connecting")) {
      markPhase(key, "database", "start");
      setState(key, "starting", "Connecting to database");
    }
    if (text.includes("Database connected") || text.includes("database connected")) {
      markPhase(key, "database", "end");
      markPhase(key, "schema", "start");
    }
    if (text.includes("schema synchronized")) {
      markPhase(key, "schema", "end");
      state[key].detail = "Database synchronized";
    }
    if (
      key === "aiApi" &&
      /^INFO:\s+\d+\.\d+\.\d+\.\d+:\d+ - "(?:GET \/status\/|GET \/transcript\/|POST \/generate)/.test(
        text,
      )
    )
      return;
    if (text.includes(service.ready)) {
      if (state[key].status === "ready") return;
      if (service.label === "API") {
        markPhase(key, "schema", "end");
        markPhase(key, "health", "start");
        setState(key, "checking", "Verifying health endpoint");
        if (!(await waitForLiveBackend(key))) return;
        markPhase(key, "health", "end");
      }
      markPhase(key, "process", "end");
      setState(key, "ready", serviceUrl(key));
      const dependent = key === "userApi" ? "userWeb" : key === "adminApi" ? "adminWeb" : null;
      if (dependent && selected.includes(dependent)) spawnService(dependent);
      finishIfReady();
    }
  };
  stream(child.stdout, key, process.stdout, onLine);
  stream(child.stderr, key, process.stderr, onLine);
  child.on("error", (error) => failService(key, error.message));
  child.on("exit", (code, signal) => {
    children.delete(key);
    if (!stopping && code !== 0)
      failService(key, `Exited with code ${code ?? "unknown"}${signal ? ` (${signal})` : ""}`);
    if (children.size === 0 && stopping) process.exit(process.exitCode || 0);
  });
  setTimeout(() => {
    if (!["ready", "failed"].includes(state[key].status)) failService(key, "Readiness timed out");
  }, READY_TIMEOUT_MS);
}
async function standaloneFrontend(key) {
  const apiKey = services[key].backend;
  setState(key, "checking", `Checking ${serviceUrl(apiKey)}`);
  if (!(await checkHealth(services[apiKey].health))) {
    failService(
      key,
      `Backend unavailable. Run npm run dev:${apiKey === "userApi" ? "backend" : "backend-admin"}`,
    );
    return;
  }
  spawnService(key);
}
function finishIfReady() {
  if (finalShown || !selected.every((key) => state[key].status === "ready")) return;
  finalShown = true;
  if (animation) {
    clearInterval(animation);
    animation = null;
  }
  render();
  if (interactive) process.stdout.write("\x1b[?25h");
}
function failService(key, detail) {
  if (detail.includes("EADDRINUSE")) {
    detail = `Port already in use for ${serviceUrl(key)}. Another ${services[key].label} process is running there.`;
  }
  setState(key, "failed", detail);
  clearDashboard();
  process.stderr.write(
    `${C.red}${C.bold}[FAILED] ${services[key].group} ${services[key].label}:${C.reset} ${detail}\n`,
  );
  render();
  process.exitCode = 1;
  stopAll();
}
function stopAll(signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  if (animation) clearInterval(animation);
  clearDashboard();
  process.stdout.write("\x1b[?25h[STOPPING] Development services\n");
  for (const child of children.values()) if (!child.killed) child.kill(signal);
}
async function detectExistingServices() {
  for (const key of selected) {
    const service = services[key];
    const probeUrl = service.label === "API" ? service.health : service.url;
    if (!(await checkHealth(probeUrl))) continue;

    externallyRunning.add(key);
    state[key].runStartedAt = null;
    state[key].elapsed = null;
    setState(key, "ready", `${serviceUrl(key)} | already running`);

    if (service.label === "API") {
      const dependent = key === "userApi" ? "userWeb" : "adminWeb";
      if (selected.includes(dependent) && !externallyRunning.has(dependent)) {
        setState(dependent, "waiting", "Backend already available");
      }
    }
  }
}

function printExistingServiceNotice() {
  if (externallyRunning.size === 0) return;
  clearDashboard();
  for (const key of externallyRunning) {
    process.stdout.write(
      `${services[key].color}[${servicePrefix(key)}/${services[key].label}]${C.reset} ALREADY RUNNING | ${serviceUrl(key)} | Reusing existing process\n`,
    );
  }
  render();
}

async function main() {
  if (interactive) process.stdout.write("\x1b[?25l");
  render();
  animation = setInterval(render, 90);

  await detectExistingServices();
  printExistingServiceNotice();

  if (mode === "frontend") {
    if (externallyRunning.has("userWeb")) {
      finishIfReady();
      return;
    }
    return standaloneFrontend("userWeb");
  }
  if (mode === "frontend-admin") {
    if (externallyRunning.has("adminWeb")) {
      finishIfReady();
      return;
    }
    return standaloneFrontend("adminWeb");
  }

  for (const key of selected) {
    if (services[key].backend || externallyRunning.has(key)) continue;
    spawnService(key);
  }

  for (const apiKey of ["userApi", "adminApi"]) {
    if (!selected.includes(apiKey) || !externallyRunning.has(apiKey)) continue;
    const webKey = apiKey === "userApi" ? "userWeb" : "adminWeb";
    if (selected.includes(webKey) && !externallyRunning.has(webKey)) spawnService(webKey);
  }

  finishIfReady();
}
process.on("SIGINT", () => stopAll("SIGINT"));
process.on("SIGTERM", () => stopAll("SIGTERM"));
process.on("exit", () => {
  if (interactive) process.stdout.write("\x1b[?25h");
});
main().catch((error) => {
  process.stderr.write(`[FAILED] ${error.message}\n`);
  process.exit(1);
});
