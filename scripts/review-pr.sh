#!/usr/bin/env bash
#
# review-pr.sh — check a pull request before you review it by hand
#
# WHAT IT DOES
#   1. Checks out the PR locally
#   2. Shows what changed and how big it is
#   3. Flags risky files (auth, payments, database models)
#   4. Runs the linter on only the services that changed
#   5. Runs the build on only the frontends that changed
#   6. Syntax-checks changed Python files in ai_service
#   7. Scans the diff for red flags (secrets, console.log, .env, TODOs)
#   8. Checks commit message format
#   9. Prints exactly which checks passed, failed, or were skipped, then a verdict
#
#   It does NOT run the automated test suites (CI does). A passing result means
#   "the checks listed above passed", not "this PR is correct".
#
# USAGE
#   ./review-pr.sh 123            # review PR number 123
#   ./review-pr.sh feature/foo    # review a branch you already have locally
#   BASE_REF=upstream/main ./review-pr.sh 123   # compare against another base
#   NO_FETCH=1 ./review-pr.sh 123               # do not fetch the base first
#
# REQUIREMENTS
#   - GitHub CLI:  https://cli.github.com   (run: gh auth login)
#   - Run it from the repository root
#   - npm install done in every service you want linted/built (npm run setup)
#
# BASE BRANCH
#   The base is BASE_REF, or upstream/main when an `upstream` remote exists,
#   otherwise origin/main. It is fetched first so a stale local copy is never
#   used, and the exact base commit is printed. With NO_FETCH=1 (or a base that
#   is not a remote branch) nothing is fetched and the verdict carries a warning.
#
# YOUR LOCAL WORK IS NEVER TOUCHED
#   If you have uncommitted changes or untracked files (ignored files such as
#   node_modules are fine) the script stops before switching branches.
#   Your original branch (or detached commit) is restored on exit, on Ctrl+C,
#   and when a check fails; if it cannot be restored the script exits 1.
#
# EXIT CODES
#   0  every required check ran and passed, no warnings
#   1  a check failed, or the review could not be run (bad input, uncommitted
#      work, fetch or checkout failure, original branch not restored)
#   2  incomplete or warnings: a required check was skipped (for example
#      node_modules missing), or there are warnings a human must read.
#      This is never a safe-to-merge result.
#
# It restores your original branch when it finishes.
# -----------------------------------------------------------------------------

set -euo pipefail

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
cd "$ROOT"

ORIGINAL_REF=$(git symbolic-ref -q --short HEAD || git rev-parse HEAD)

# Refuse to switch branches over local work (tracked changes or untracked files)
DIRTY=$(git status --porcelain)
if [ -n "$DIRTY" ]; then
  echo "${RED}You have uncommitted or untracked files. Nothing was changed.${RST}"
  head -20 <<<"$DIRTY" | sed 's/^/  /'
  echo "  Commit, stash (git stash -u) or move them, then run this again."
  exit 1
fi

if [ -z "${BASE_REF:-}" ]; then
  if git remote get-url upstream >/dev/null 2>&1; then BASE_REF=upstream/main; else BASE_REF=origin/main; fi
fi
TMP_DIR=""
SWITCHED=0

# Results of every check, so the summary can say exactly what happened
N_PASS=0; N_FAIL=0; N_WARN=0; N_SKIP=0
PASS_LIST=""; FAIL_LIST=""; WARN_LIST=""; SKIP_LIST=""

# record <PASS|FAIL|WARN|SKIP> <description>
record() {
  case "$1" in
    PASS) N_PASS=$((N_PASS+1)); PASS_LIST+="    - $2"$'\n' ;;
    FAIL) N_FAIL=$((N_FAIL+1)); FAIL_LIST+="    - $2"$'\n' ;;
    WARN) N_WARN=$((N_WARN+1)); WARN_LIST+="    - $2"$'\n' ;;
    SKIP) N_SKIP=$((N_SKIP+1)); SKIP_LIST+="    - $2"$'\n' ;;
  esac
}

cleanup() {
  local status=$?
  trap - EXIT
  if [ "$SWITCHED" -eq 1 ]; then
    echo
    echo "${BLU}Returning to:${RST} $ORIGINAL_REF"
    if ! git checkout -q "$ORIGINAL_REF" >/dev/null 2>&1; then
      echo "${RED}Could not return to $ORIGINAL_REF. Run: git checkout $ORIGINAL_REF${RST}" >&2
      [ "$status" -ge 128 ] || status=1
    fi
  fi
  rm -rf "$TMP_DIR"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP

TMP_DIR=$(mktemp -d)

hr() { printf '%s\n' "--------------------------------------------------------------"; }
head2() { echo; echo "${BLD}${BLU}$1${RST}"; hr; }

# changed_matches <regex> — true if any changed file matches
changed_matches() { grep -qE "$1" <<<"$CHANGED"; }

# fetch_base — make sure BASE_REF is current, or say clearly that it is not
fetch_base() {
  local remote="${BASE_REF%%/*}" branch="${BASE_REF#*/}"
  if [ "$remote" = "$BASE_REF" ] || ! grep -qxF -- "$remote" <<<"$(git remote)"; then
    echo "  ${YEL}Base '$BASE_REF' is not a remote branch, so it was not fetched.${RST}"
    record WARN "base $BASE_REF not fetched (not a remote branch)"
  elif [ "${NO_FETCH:-0}" = "1" ]; then
    echo "  ${YEL}NO_FETCH=1: using the local copy of $BASE_REF, which may be stale.${RST}"
    record WARN "base $BASE_REF not fetched (NO_FETCH=1)"
  elif git fetch --quiet "$remote" "$branch" 2>"$TMP_DIR/fetch.err"; then
    echo "  Fetched $BASE_REF"
  else
    echo "${RED}Could not fetch $BASE_REF:${RST}"
    sed 's/^/  /' "$TMP_DIR/fetch.err"
    echo "  Check your network and remote, or set NO_FETCH=1 to use the local copy."
    exit 1
  fi
}

# -----------------------------------------------------------------------------
head2 "1. GETTING THE CODE"
# -----------------------------------------------------------------------------

fetch_base
SWITCHED=1

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
else
  echo "Checking out branch: $TARGET"
  if ! git checkout "$TARGET" >/dev/null 2>&1; then
    echo "${RED}Could not check out branch '$TARGET'.${RST}"
    exit 1
  fi
fi

# What are we comparing against?
if ! BASE=$(git merge-base "$BASE_REF" HEAD 2>/dev/null); then
  echo "${RED}Cannot find a merge base with '$BASE_REF'.${RST}"
  echo "  Fetch it first (git fetch) or set BASE_REF, e.g. BASE_REF=upstream/main"
  exit 1
fi
BASE_TIP=$(git rev-parse "$BASE_REF")
echo "  Base: $BASE_REF = ${BASE_TIP:0:12}"
echo "  Merge base with this branch: ${BASE:0:12}"
CHANGED=$(git diff --name-only "$BASE"...HEAD)

if [ -z "$CHANGED" ]; then
  echo "${YEL}No changed files detected. Nothing was reviewed.${RST}"
  exit 2
fi

FILE_COUNT=$(wc -l <<<"$CHANGED" | tr -d ' ')
NUMSTAT=$(git diff --numstat "$BASE"...HEAD)
INS=$(awk '{s+=$1} END{print s+0}' <<<"$NUMSTAT")
DEL=$(awk '{s+=$2} END{print s+0}' <<<"$NUMSTAT")

echo "${GRN}Checked out.${RST}"
echo "  Files changed: $FILE_COUNT"
echo "  Lines: +$INS / -$DEL"

# -----------------------------------------------------------------------------
head2 "2. SIZE CHECK"
# -----------------------------------------------------------------------------

TOTAL_LINES=$(( INS + DEL ))
if [ "$TOTAL_LINES" -gt 800 ]; then
  echo "${RED}TOO BIG: $TOTAL_LINES lines changed.${RST}"
  echo "  Ask them to split this PR. Large PRs cannot be reviewed properly."
  record FAIL "size check ($TOTAL_LINES lines, over 800)"
elif [ "$TOTAL_LINES" -gt 400 ]; then
  echo "${YEL}LARGE: $TOTAL_LINES lines changed.${RST}"
  echo "  Reviewable, but worth asking if it can be split."
  record WARN "size check ($TOTAL_LINES lines, over 400)"
else
  echo "${GRN}Good size: $TOTAL_LINES lines.${RST}"
  record PASS "size check ($TOTAL_LINES lines)"
fi

echo
echo "Files changed:"
sed 's/^/  /' <<<"$CHANGED"

# -----------------------------------------------------------------------------
head2 "3. RISKY FILES"
# -----------------------------------------------------------------------------

RISK_PATTERN='(middleware/auth|middleware/adminAuth|routes/payment|routes/razorpay|routes/webhook|controllers/authController|models/|env-validator|migrations/|package\.json|requirements\.txt|\.env|config/)'
RISKY=$(grep -E "$RISK_PATTERN" <<<"$CHANGED" || true)

if [ -n "$RISKY" ]; then
  echo "${YEL}This PR touches sensitive areas — review it yourself:${RST}"
  sed 's/^/  /' <<<"$RISKY"
  record WARN "risky files touched"
else
  echo "${GRN}No auth, payment, database or dependency files touched.${RST}"
  record PASS "risky files scan"
fi

# -----------------------------------------------------------------------------
# run_npm_check <lint|build> <dir>
# Required check: if it cannot run, it is recorded as SKIP (never as a pass).
# -----------------------------------------------------------------------------
run_npm_check() {
  local kind="$1" dir="$2"
  local name="$kind $dir"
  local out="$TMP_DIR/${kind}_${dir}.out"

  if [ ! -f "$dir/package.json" ]; then
    echo "  ${YEL}SKIP${RST} $name (no package.json)"
    record SKIP "$name (no package.json)"
    return 0
  fi
  if ! command -v npm >/dev/null 2>&1; then
    echo "  ${YEL}SKIP${RST} $name (npm not installed)"
    record SKIP "$name (npm not installed)"
    return 0
  fi
  if [ ! -d "$dir/node_modules" ]; then
    echo "  ${YEL}SKIP${RST} $name (node_modules not installed - run: npm run setup)"
    record SKIP "$name (node_modules not installed)"
    return 0
  fi
  if ! grep -q "\"$kind\"" "$dir/package.json"; then
    echo "  ${YEL}SKIP${RST} $name (no \"$kind\" script in package.json)"
    record SKIP "$name (no $kind script)"
    return 0
  fi

  echo "  running $name ..."
  if (cd "$dir" && npm run "$kind" >"$out" 2>&1); then
    echo "  ${GRN}PASS${RST} $name"
    record PASS "$name"
  else
    echo "  ${RED}FAIL${RST} $name"
    tail -20 "$out" | sed 's/^/    /'
    record FAIL "$name"
  fi
}

# -----------------------------------------------------------------------------
head2 "4. LINT"
# -----------------------------------------------------------------------------

NODE_CHANGED=0
for d in backend frontend frontendAdmin backendAdmin; do
  if changed_matches "^$d/"; then
    NODE_CHANGED=1
    run_npm_check lint "$d"
  fi
done
if [ "$NODE_CHANGED" -eq 0 ]; then
  echo "  (no Node service changed — lint not applicable)"
fi

# -----------------------------------------------------------------------------
head2 "5. BUILD (frontends only)"
# -----------------------------------------------------------------------------

FRONTEND_CHANGED=0
for d in frontend frontendAdmin; do
  if changed_matches "^$d/"; then
    FRONTEND_CHANGED=1
    run_npm_check build "$d"
  fi
done
if [ "$FRONTEND_CHANGED" -eq 0 ]; then
  echo "  (no frontend changed — build not applicable)"
fi

# -----------------------------------------------------------------------------
head2 "6. PYTHON (ai_service)"
# -----------------------------------------------------------------------------

PYFILES=$(grep -E '^ai_service/.*\.py$' <<<"$CHANGED" || true)
if [ -n "$PYFILES" ]; then
  echo "  ai_service changed — syntax check:"
  if command -v python3 >/dev/null 2>&1; then
    # shellcheck disable=SC2086
    if python3 -m compileall -q $PYFILES >"$TMP_DIR/py.out" 2>&1; then
      echo "  ${GRN}PASS${RST} Python syntax"
      record PASS "python syntax (ai_service)"
    else
      echo "  ${RED}FAIL${RST} Python syntax"
      tail -20 "$TMP_DIR/py.out" | sed 's/^/    /'
      record FAIL "python syntax (ai_service)"
    fi
  else
    echo "  ${YEL}SKIP${RST} Python syntax (python3 not found)"
    record SKIP "python syntax (python3 not found)"
  fi
else
  echo "  (no ai_service Python files changed — not applicable)"
fi

# -----------------------------------------------------------------------------
head2 "7. RED FLAG SCAN"
# -----------------------------------------------------------------------------

DIFF=$(git diff "$BASE"...HEAD)
SCAN_FLAGS=0

scan() {
  local label="$1" pattern="$2" severity="$3"
  local hits
  hits=$(grep -E "$pattern" <<<"$DIFF" | head -5 || true)
  if [ -n "$hits" ]; then
    SCAN_FLAGS=$((SCAN_FLAGS+1))
    if [ "$severity" = "error" ]; then
      echo "  ${RED}[BLOCK]${RST} $label"
      record FAIL "red flag: $label"
    else
      echo "  ${YEL}[WARN]${RST} $label"
      record WARN "red flag: $label"
    fi
    sed 's/^/      /' <<<"$hits"
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
for d in $(grep 'package.json' <<<"$CHANGED" | cut -d/ -f1 | sort -u); do
  if ! changed_matches "^$d/package-lock.json"; then
    echo "  ${YEL}[WARN]${RST} $d/package.json changed but package-lock.json did not"
    record WARN "red flag: $d/package.json changed without package-lock.json"
    SCAN_FLAGS=$((SCAN_FLAGS+1))
  fi
done

# Large binaries
BIG=""
while IFS= read -r f; do
  [ -f "$f" ] || continue
  s=$(wc -c < "$f")
  if [ "$s" -gt 1000000 ]; then
    BIG+="$f ($((s/1024)) KB)"$'\n'
  fi
done <<<"$CHANGED"
if [ -n "$BIG" ]; then
  echo "  ${RED}[BLOCK]${RST} Large binary file committed:"
  sed 's/^/      /' <<<"$BIG"
  record FAIL "red flag: large binary file committed"
  SCAN_FLAGS=$((SCAN_FLAGS+1))
fi

if [ "$SCAN_FLAGS" -eq 0 ]; then
  echo "  ${GRN}Clean — no red flags found.${RST}"
  record PASS "red flag scan"
fi

# -----------------------------------------------------------------------------
head2 "8. COMMIT MESSAGES"
# -----------------------------------------------------------------------------

echo "Commits in this PR:"
git log --oneline "$BASE"...HEAD | sed 's/^/  /'
BAD_MSG=$(git log --format=%s "$BASE"...HEAD | grep -vE '^(feat|fix|docs|style|refactor|test|chore|perf|build|ci)(\(.+\))?: .+' || true)
if [ -n "$BAD_MSG" ]; then
  echo "${YEL}Some commit messages do not follow 'type: description':${RST}"
  sed 's/^/  /' <<<"$BAD_MSG"
  record WARN "commit message format"
else
  echo "${GRN}All commit messages follow the convention.${RST}"
  record PASS "commit message format"
fi

# -----------------------------------------------------------------------------
head2 "SUMMARY OF CHECKS"
# -----------------------------------------------------------------------------

echo "  Passed  : $N_PASS"
echo "  Failed  : $N_FAIL"
echo "  Skipped : $N_SKIP"
echo "  Warnings: $N_WARN"
echo
[ -z "$PASS_LIST" ] || { echo "  Passed:";   printf '%s' "$PASS_LIST"; }
[ -z "$FAIL_LIST" ] || { echo "  Failed:";   printf '%s' "$FAIL_LIST"; }
[ -z "$SKIP_LIST" ] || { echo "  Skipped:";  printf '%s' "$SKIP_LIST"; }
[ -z "$WARN_LIST" ] || { echo "  Warnings:"; printf '%s' "$WARN_LIST"; }
echo "  Not run by this script: automated tests (npm test / CI)"

# -----------------------------------------------------------------------------
head2 "VERDICT"
# -----------------------------------------------------------------------------

if [ "$N_FAIL" -gt 0 ]; then
  echo "${RED}${BLD}  >>> DO NOT MERGE — $N_FAIL check(s) failed (see above)${RST}"
  echo
  echo "  Suggested comment:"
  echo "  ----------------------------------------------------------"
  echo "  Thanks for this. A few things before I can approve:"
  if grep -qE '^\+.*console\.log\(' <<<"$DIFF"; then echo "  - Please remove the console.log statements"; fi
  if grep -qE '^\+\+\+ .*/\.env$' <<<"$DIFF"; then echo "  - A .env file is included. Please remove it (it should never be committed)"; fi
  echo "  - Please fix the failed checks listed above"
  echo "  - Please run 'npm run lint' from the repo root before pushing"
  echo "  Push again when ready, no need to open a new PR."
  echo "  ----------------------------------------------------------"
  exit 1
elif [ "$N_SKIP" -gt 0 ]; then
  echo "${YEL}${BLD}  >>> INCOMPLETE — $N_SKIP required check(s) were skipped${RST}"
  echo "  No verdict can be given. This is NOT a safe-to-merge result."
  echo "  Fix the skipped checks (for example: npm run setup) and run again."
  exit 2
elif [ "$N_WARN" -gt 0 ]; then
  echo "${YEL}${BLD}  >>> NEEDS A LOOK — $N_WARN warning(s) above${RST}"
  echo "  All required checks ran and passed. Read the diff and the warnings yourself."
  exit 2
else
  echo "${GRN}${BLD}  >>> ALL PERFORMED CHECKS PASSED${RST}"
  echo "  The $N_PASS checks listed above passed. Automated tests were not run here."
  echo
  echo "  Still do these two things yourself:"
  echo "    1. Read the diff for logic errors (the script cannot judge intent)"
  echo "    2. Confirm the PR description explains WHY"
  exit 0
fi