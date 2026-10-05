#!/usr/bin/env bash
#
# review-pr.sh — check a pull request when you have no tests
#
# WHAT IT DOES
#   1. Checks out the PR locally
#   2. Shows what changed and how big it is
#   3. Runs the linter on only the services that changed
#   4. Runs the build on only the frontends that changed
#   5. Scans the diff for red flags (secrets, console.log, .env, TODOs)
#   6. Flags risky files (auth, payments, database models)
#   7. Prints a verdict
#
# USAGE
#   ./review-pr.sh 123            # review PR number 123
#   ./review-pr.sh feature/foo    # review a branch you already have locally
#
# REQUIREMENTS
#   - GitHub CLI:  https://cli.github.com   (run: gh auth login)
#   - Run it from the repository root
#
# It restores your original branch when it finishes.
# -----------------------------------------------------------------------------

set -uo pipefail

# Colours (disabled if not a terminal)
if [ -t 1 ]; then
  RED=$'\033[31m'; YEL=$'\033[33m'; GRN=$'\033[32m'; BLU=$'\033[34m'; BLD=$'\033[1m'; RST=$'\033[0m'
else
  RED=""; YEL=""; GRN=""; BLU=""; BLD=""; RST=""
fi

TARGET="${1:-}"
if [ -z "$TARGET" ]; then
  echo "Usage: $0 <pr-number|branch-name>"
  exit 1
fi

# Must be inside a git repo
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "${RED}Not inside a git repository. Run this from the repo root.${RST}"
  exit 1
fi

# Move to the repo root so relative paths work
ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT" || exit 1

ORIGINAL_BRANCH=$(git rev-parse --abbrev-ref HEAD)
PROBLEMS=0
WARNINGS=0

cleanup() {
  echo
  echo "${BLU}Returning to branch:${RST} $ORIGINAL_BRANCH"
  git checkout "$ORIGINAL_BRANCH" >/dev/null 2>&1
}
trap cleanup EXIT

hr() { printf '%s\n' "--------------------------------------------------------------"; }
head2() { echo; echo "${BLD}${BLU}$1${RST}"; hr; }

# -----------------------------------------------------------------------------
head2 "1. GETTING THE CODE"
# -----------------------------------------------------------------------------

if [[ "$TARGET" =~ ^[0-9]+$ ]]; then
  if ! command -v gh >/dev/null 2>&1; then
    echo "${RED}GitHub CLI (gh) not installed.${RST}"
    echo "  macOS:   brew install gh"
    echo "  Windows: winget install GitHub.cli"
    echo "  Linux:   sudo apt install gh"
    echo "Then run: gh auth login"
    exit 1
  fi
  echo "Checking out PR #$TARGET ..."
  if ! gh pr checkout "$TARGET" >/dev/null 2>&1; then
    echo "${RED}Could not check out PR #$TARGET.${RST}"
    echo "Check the number exists and that you ran 'gh auth login'."
    exit 1
  fi
  PR_NUMBER="$TARGET"
else
  echo "Checking out branch: $TARGET"
  if ! git checkout "$TARGET" >/dev/null 2>&1; then
    echo "${RED}Could not check out branch '$TARGET'.${RST}"
    exit 1
  fi
  PR_NUMBER=""
fi

# What are we comparing against?
BASE=$(git merge-base origin/main HEAD 2>/dev/null || echo "origin/main")
CHANGED=$(git diff --name-only "$BASE"...HEAD 2>/dev/null)

if [ -z "$CHANGED" ]; then
  CHANGED=$(git diff --name-only HEAD~1 2>/dev/null)
fi

if [ -z "$CHANGED" ]; then
  echo "${YEL}No changed files detected. Nothing to review.${RST}"
  exit 0
fi

FILE_COUNT=$(echo "$CHANGED" | wc -l | tr -d ' ')
INS=$(git diff --shortstat "$BASE"...HEAD | grep -oE '[0-9]+ insertion' | grep -oE '[0-9]+' | head -1 || echo 0)
DEL=$(git diff --shortstat "$BASE"...HEAD | grep -oE '[0-9]+ deletion'  | grep -oE '[0-9]+' | head -1 || echo 0)

echo "${GRN}Checked out.${RST}"
echo "  Files changed: $FILE_COUNT"
echo "  Lines: +${INS:-0} / -${DEL:-0}"

# -----------------------------------------------------------------------------
head2 "2. SIZE CHECK"
# -----------------------------------------------------------------------------

TOTAL_LINES=$(( ${INS:-0} + ${DEL:-0} ))
if [ "$TOTAL_LINES" -gt 800 ]; then
  echo "${RED}TOO BIG: $TOTAL_LINES lines changed.${RST}"
  echo "  Ask them to split this PR. Large PRs cannot be reviewed properly."
  PROBLEMS=$((PROBLEMS+1))
elif [ "$TOTAL_LINES" -gt 400 ]; then
  echo "${YEL}LARGE: $TOTAL_LINES lines changed.${RST}"
  echo "  Reviewable, but worth asking if it can be split."
  WARNINGS=$((WARNINGS+1))
else
  echo "${GRN}Good size: $TOTAL_LINES lines.${RST}"
fi

echo
echo "Files changed:"
echo "$CHANGED" | sed 's/^/  /'

# -----------------------------------------------------------------------------
head2 "3. RISKY FILES"
# -----------------------------------------------------------------------------

RISK_PATTERN='(middleware/auth|middleware/adminAuth|routes/payment|routes/razorpay|routes/webhook|controllers/authController|models/|env-validator|migrations/|package\.json|requirements\.txt|\.env|config/)'
RISKY=$(echo "$CHANGED" | grep -E "$RISK_PATTERN" || true)

if [ -n "$RISKY" ]; then
  echo "${YEL}This PR touches sensitive areas — review it yourself:${RST}"
  echo "$RISKY" | sed 's/^/  /'
  WARNINGS=$((WARNINGS+1))
else
  echo "${GRN}No auth, payment, database or dependency files touched.${RST}"
fi

# -----------------------------------------------------------------------------
head2 "4. LINT"
# -----------------------------------------------------------------------------

run_lint() {
  local dir="$1"
  if [ -d "$dir" ] && [ -f "$dir/package.json" ]; then
    if [ ! -d "$dir/node_modules" ]; then
      echo "  ${YEL}SKIP${RST} $dir (node_modules not installed - run: cd $dir && npm install)"
      WARNINGS=$((WARNINGS+1))
      return
    fi
    if grep -q '"lint"' "$dir/package.json" 2>/dev/null; then
      echo "  linting $dir ..."
      if (cd "$dir" && npm run lint >/tmp/lint_out_$$ 2>&1); then
        echo "  ${GRN}PASS${RST} $dir"
      else
        echo "  ${RED}FAIL${RST} $dir"
        tail -20 /tmp/lint_out_$$ | sed 's/^/    /'
        PROBLEMS=$((PROBLEMS+1))
      fi
      rm -f /tmp/lint_out_$$
    fi
  fi
}

echo "$CHANGED" | grep -q '^backend/'       && run_lint backend
echo "$CHANGED" | grep -q '^frontend/'      && run_lint frontend
echo "$CHANGED" | grep -q '^frontendAdmin/' && run_lint frontendAdmin
echo "$CHANGED" | grep -q '^backendAdmin/'  && run_lint backendAdmin

if ! echo "$CHANGED" | grep -qE '^(backend|frontend|frontendAdmin|backendAdmin)/'; then
  echo "  (no Node service changed — skipping lint)"
fi

# -----------------------------------------------------------------------------
head2 "5. BUILD (frontends only)"
# -----------------------------------------------------------------------------

run_build() {
  local dir="$1"
  if [ -d "$dir" ] && [ -f "$dir/package.json" ]; then
    if [ ! -d "$dir/node_modules" ]; then
      echo "  ${YEL}SKIP${RST} $dir build (node_modules not installed)"
      WARNINGS=$((WARNINGS+1))
      return
    fi
    echo "  building $dir ..."
    if (cd "$dir" && npm run build >/tmp/build_out_$$ 2>&1); then
      echo "  ${GRN}PASS${RST} $dir build"
    else
      echo "  ${RED}FAIL${RST} $dir build — the app does not compile"
      tail -20 /tmp/build_out_$$ | sed 's/^/    /'
      PROBLEMS=$((PROBLEMS+1))
    fi
    rm -f /tmp/build_out_$$
  fi
}

if echo "$CHANGED" | grep -q '^frontend/';      then run_build frontend; fi
if echo "$CHANGED" | grep -q '^frontendAdmin/'; then run_build frontendAdmin; fi

# -----------------------------------------------------------------------------
head2 "6. PYTHON (ai_service)"
# -----------------------------------------------------------------------------

if echo "$CHANGED" | grep -q '^ai_service/'; then
  echo "  ai_service changed — syntax check:"
  PYFILES=$(echo "$CHANGED" | grep -E '^ai_service/.*\.py$' || true)
  if [ -n "$PYFILES" ]; then
    if command -v python3 >/dev/null 2>&1; then
      if python3 -m compileall -q $PYFILES >/tmp/py_out_$$ 2>&1; then
        echo "  ${GRN}PASS${RST} Python syntax"
      else
        echo "  ${RED}FAIL${RST} Python syntax"
        tail -20 /tmp/py_out_$$ | sed 's/^/    /'
        PROBLEMS=$((PROBLEMS+1))
      fi
      rm -f /tmp/py_out_$$
    else
      echo "  ${YEL}python3 not found — skipped${RST}"
    fi
  fi
else
  echo "  (ai_service not touched)"
fi

# -----------------------------------------------------------------------------
head2 "7. RED FLAG SCAN"
# -----------------------------------------------------------------------------

DIFF=$(git diff "$BASE"...HEAD 2>/dev/null)

scan() {
  local label="$1"; local pattern="$2"; local severity="$3"
  local hits
  hits=$(echo "$DIFF" | grep -E "$pattern" | head -5 || true)
  if [ -n "$hits" ]; then
    if [ "$severity" = "error" ]; then
      echo "  ${RED}[BLOCK]${RST} $label"
      PROBLEMS=$((PROBLEMS+1))
    else
      echo "  ${YEL}[WARN]${RST} $label"
      WARNINGS=$((WARNINGS+1))
    fi
    echo "$hits" | sed 's/^/      /'
  fi
}

scan "console.log left in the code"      '^\+.*console\.log\('        warn
scan "debugger statement"                '^\+.*\bdebugger\b'          error
scan "Committed .env file"               '^\+\+\+ .*/\.env$'          error
scan "Possible hardcoded secret"         '^\+.*(sk_live_|sk_test_|AIza|rzp_live_|whsec_|ghp_|-----BEGIN [A-Z ]*PRIVATE KEY)' error
scan "Hardcoded localhost URL"           '^\+.*https?://localhost'    warn
scan "TODO / FIXME / HACK added"         '^\+.*(TODO|FIXME|HACK|XXX)' warn
scan "node_modules committed"            '^\+\+\+ .*node_modules/'    error
scan "Commented-out code block"          '^\+[[:space:]]*//[[:space:]]*(const|let|var|function|return|if)\b' warn
scan "alert() in production code"        '^\+.*\balert\('             warn

# Lock file consistency
if echo "$CHANGED" | grep -q 'package.json'; then
  DIR_CHANGED=$(echo "$CHANGED" | grep 'package.json' | cut -d/ -f1 | sort -u)
  for d in $DIR_CHANGED; do
    if ! echo "$CHANGED" | grep -q "^$d/package-lock.json"; then
      echo "  ${YEL}[WARN]${RST} $d/package.json changed but package-lock.json did not"
      WARNINGS=$((WARNINGS+1))
    fi
  done
fi

# Large binaries
BIG=$(echo "$CHANGED" | while read -r f; do
  [ -f "$f" ] || continue
  s=$(wc -c < "$f" 2>/dev/null || echo 0)
  [ "$s" -gt 1000000 ] && echo "$f ($((s/1024)) KB)"
done)
if [ -n "$BIG" ]; then
  echo "  ${RED}[BLOCK]${RST} Large binary file committed:"
  echo "$BIG" | sed 's/^/      /'
  PROBLEMS=$((PROBLEMS+1))
fi

if [ "$PROBLEMS" -eq 0 ] && [ "$WARNINGS" -eq 0 ]; then
  echo "  ${GRN}Clean — no red flags found.${RST}"
fi

# -----------------------------------------------------------------------------
head2 "8. COMMIT MESSAGES"
# -----------------------------------------------------------------------------

echo "Commits in this PR:"
git log --oneline "$BASE"...HEAD | sed 's/^/  /'
BAD_MSG=$(git log --format=%s "$BASE"...HEAD | grep -vE '^(feat|fix|docs|style|refactor|test|chore|perf|build|ci)(\(.+\))?: .+' || true)
if [ -n "$BAD_MSG" ]; then
  echo "${YEL}Some commit messages do not follow 'type: description':${RST}"
  echo "$BAD_MSG" | sed 's/^/  /'
  WARNINGS=$((WARNINGS+1))
else
  echo "${GRN}All commit messages follow the convention.${RST}"
fi

# -----------------------------------------------------------------------------
head2 "VERDICT"
# -----------------------------------------------------------------------------

echo "  Blocking problems : $PROBLEMS"
echo "  Warnings          : $WARNINGS"
echo


if [ "$PROBLEMS" -gt 0 ]; then
  echo "${RED}${BLD}  >>> DO NOT MERGE — fix the blocking problems above${RST}"
  echo
  echo "  Suggested comment:"
  echo "  ----------------------------------------------------------"
  echo "  Thanks for this. A few things before I can approve:"
  echo "  $( if echo "$DIFF" | grep -qE '^\+.*console\.log\('; then echo '- Please remove the console.log statements'; fi )"
  echo "  $( if echo "$DIFF" | grep -qE '^\+\+\+ .*/\.env$'; then echo '- A .env file is included. Please remove it (it should never be committed)'; fi )"
  echo "  - Please run 'npm run lint' from the repo root before pushing"
  echo "  Push again when ready, no need to open a new PR."
  echo "  ----------------------------------------------------------"
  exit 1
elif [ "$WARNINGS" -gt 0 ]; then
  echo "${YEL}${BLD}  >>> NEEDS A LOOK — warnings above${RST}"
  echo "  Read the diff yourself. If the warnings are acceptable, merge."
  exit 0
else
  echo "${GRN}${BLD}  >>> SAFE TO MERGE${RST}"
  echo "  Lint, build and red-flag scans all passed."
  echo
  echo "  Still do these two things yourself:"
  echo "    1. Read the diff for logic errors (the script cannot judge intent)"
  echo "    2. Confirm the PR description explains WHY"
  exit 0
fi
