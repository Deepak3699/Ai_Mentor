#!/usr/bin/env bash
#
# test-review-scripts.sh — proves review-pr.sh and smoke-test.sh report honestly.
#
# WHAT IT DOES
#   Runs both scripts against throw-away git repos and a fake `curl` / `npm`
#   (no real services, no network) and checks the exit code and wording for:
#     - pass         every check ran and passed          -> exit 0
#     - failure      a check failed or a service is down -> exit 1
#     - warning      nothing failed, a human must look   -> exit 2
#     - missing dep  a required check was skipped        -> exit 2, never
#                    labelled as passed or safe to merge
#     - bad input    unknown branch / base, missing curl -> exit 1
#   It also checks that both scripts stop on unexpected command failures
#   (set -euo pipefail) and contain no stale issue-number references.
#
# USAGE
#   scripts/test-review-scripts.sh
#
# Exit code 0 = all checks passed, 1 = at least one check failed
# -----------------------------------------------------------------------------

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REVIEW="$ROOT/scripts/review-pr.sh"
SMOKE="$ROOT/scripts/smoke-test.sh"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

PASSED=0
FAILED=0

pass() { echo "  PASS $1"; PASSED=$((PASSED+1)); }
fail() { echo "  FAIL $1"; FAILED=$((FAILED+1)); }

# expect_exit <description> <wanted> <got>
expect_exit() {
  if [ "$2" = "$3" ]; then pass "$1 (exit $3)"; else fail "$1 (wanted exit $2, got $3)"; fi
}
# expect_has <description> <text> <needle>
expect_has() {
  if grep -qF -- "$3" <<<"$2"; then pass "$1"; else fail "$1 (missing: $3)"; fi
}
# expect_lacks <description> <text> <needle>
expect_lacks() {
  if grep -qF -- "$3" <<<"$2"; then fail "$1 (found: $3)"; else pass "$1"; fi
}

# -----------------------------------------------------------------------------
# Fake tools
# -----------------------------------------------------------------------------
MOCKBIN="$WORK/mockbin"
mkdir -p "$MOCKBIN"

# npm: exits with $MOCK_NPM_EXIT (default 0)
cat > "$MOCKBIN/npm" <<'EOF'
#!/usr/bin/env bash
exit "${MOCK_NPM_EXIT:-0}"
EOF

# curl: answers from MOCK_CURL_RULES ("<exact url>=<code>" per line, first match
# wins), otherwise MOCK_CURL_DEFAULT (200). Code 000 mimics "unreachable".
cat > "$MOCKBIN/curl" <<'EOF'
#!/usr/bin/env bash
url=""; want_code=0
for a in "$@"; do
  case "$a" in
    http*) url="$a" ;;
    '%{http_code}') want_code=1 ;;
  esac
done
code="${MOCK_CURL_DEFAULT:-200}"
while IFS='=' read -r pat c; do
  if [ -n "$pat" ] && [ "$url" = "$pat" ]; then code="$c"; break; fi
done <<<"${MOCK_CURL_RULES:-}"
if [ "$want_code" -eq 1 ]; then
  if [ "$code" = "000" ]; then printf '000'; exit 7; fi
  printf '%s' "$code"
else
  printf '<!doctype html><div id="root"></div>'
fi
EOF
chmod +x "$MOCKBIN/npm" "$MOCKBIN/curl"

# =============================================================================
echo
echo "STATIC CHECKS"
# =============================================================================

for f in "$REVIEW" "$SMOKE"; do
  name="$(basename "$f")"
  if grep -q '^set -euo pipefail$' "$f"; then
    pass "$name stops on unexpected failures (set -euo pipefail)"
  else
    fail "$name must use set -euo pipefail"
  fi
  if grep -qE 'issue #[0-9]+|#[0-9]+/#[0-9]+' "$f"; then
    fail "$name still has stale issue-number references"
  else
    pass "$name has no stale issue-number references"
  fi
  if grep -q '^# EXIT CODES' "$f"; then
    pass "$name documents its exit codes"
  else
    fail "$name must document its exit codes"
  fi
done

# =============================================================================
echo
echo "SMOKE TEST"
# =============================================================================

export BACKEND_URL="http://backend.test" ADMINAPI_URL="http://admin.test"
export FRONTEND_URL="http://front.test" ADMINUI_URL="http://adminui.test"
export AISERVICE_URL="http://ai.test"

HEALTHY_RULES="http://backend.test/api/auth/login=401
http://backend.test/api/users/watched-videos=401
http://backend.test/api/notifications=401
http://backend.test/api/analytics=401
http://backend.test/api/assistant/context=401
http://admin.test/api/admin/users=401
http://ai.test/transcript/does-not-exist.txt=404
http://ai.test/transcript/..%2F..%2F.env=404"

# run_smoke <override rules> [args...] -> sets OUT and RC
run_smoke() {
  local overrides="$1"; shift
  OUT=$(PATH="$MOCKBIN:$PATH" MOCK_CURL_RULES="$overrides"$'\n'"$HEALTHY_RULES" \
        bash "$SMOKE" "$@" 2>&1)
  RC=$?
}

run_smoke ""
expect_exit "smoke: all healthy" 0 "$RC"
expect_has  "smoke: all healthy says ALL GREEN" "$OUT" "ALL GREEN"

run_smoke "http://backend.test/=000"
expect_exit "smoke: service down" 1 "$RC"
expect_has  "smoke: service down is reported" "$OUT" "is DOWN"

run_smoke "http://backend.test/api/courses=500"
expect_exit "smoke: broken endpoint" 1 "$RC"

run_smoke "http://backend.test/api/notifications=200"
expect_exit "smoke: unprotected endpoint fails" 1 "$RC"

run_smoke "http://ai.test/docs=500"
expect_exit "smoke: warnings only" 2 "$RC"
expect_has  "smoke: warnings are not called green" "$OUT" "USABLE, with warnings"
expect_lacks "smoke: warnings are not ALL GREEN" "$OUT" "ALL GREEN"

run_smoke "http://backend.test/api/courses=500" --quick
expect_exit "smoke --quick: skips API checks, services up" 0 "$RC"
expect_has  "smoke --quick: says API checks were not run" "$OUT" "API checks were not run"

run_smoke "http://admin.test/health=503" --quick
expect_exit "smoke --quick: warning" 2 "$RC"

run_smoke "http://front.test/=000" --quick
expect_exit "smoke --quick: service down" 1 "$RC"

# Missing dependency: no curl on PATH at all
EMPTYBIN="$WORK/emptybin"; mkdir -p "$EMPTYBIN"
OUT=$(PATH="$EMPTYBIN" "$BASH" "$SMOKE" 2>&1); RC=$?
expect_exit "smoke: curl missing" 1 "$RC"
expect_has  "smoke: curl missing says no checks ran" "$OUT" "no checks could be run"

# =============================================================================
echo
echo "REVIEW-PR"
# =============================================================================

export GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test@example.com
export GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test@example.com

# make_repo <dir> — a repo with origin/main, a `backend` service, branch `other`
make_repo() {
  local dir="$1"
  rm -rf "$dir" "$dir.git"
  git init -q --bare "$dir.git"
  git init -q "$dir"
  (
    cd "$dir"
    git symbolic-ref HEAD refs/heads/main
    git config commit.gpgsign false
    mkdir -p backend notes
    echo '{"scripts":{"lint":"eslint ."}}' > backend/package.json
    echo '{}' > backend/package-lock.json
    echo base > README.md
    git add -A
    git commit -q -m "chore: base"
    git remote add origin "$dir.git"
    git push -q origin main
    git branch other
    git checkout -q -b feature
  )
}

# commit_on_feature <dir> <file> <content> [message]
commit_on_feature() {
  (
    cd "$1"
    mkdir -p "$(dirname "$2")"
    printf '%s\n' "$3" > "$2"
    git add -A
    git commit -q -m "${4:-feat: change}"
  )
}

# run_review <dir> [args...] -> sets OUT and RC (runs from branch `other`)
run_review() {
  local dir="$1"; shift
  OUT=$(cd "$dir" && git checkout -q other && PATH="$MOCKBIN:$PATH" bash "$REVIEW" "$@" 2>&1)
  RC=$?
}

REPO="$WORK/repo"

# --- pass --------------------------------------------------------------------
make_repo "$REPO"
mkdir -p "$REPO/backend/node_modules"
commit_on_feature "$REPO" backend/src.js "const a = 1;"
run_review "$REPO" feature
expect_exit  "review: everything ran and passed" 0 "$RC"
expect_has   "review: lists the lint check that ran" "$OUT" "lint backend"
expect_has   "review: pass wording names performed checks" "$OUT" "ALL PERFORMED CHECKS PASSED"
expect_lacks "review: never claims SAFE TO MERGE" "$OUT" "SAFE TO MERGE"
expect_has   "review: says automated tests were not run" "$OUT" "Not run by this script: automated tests"
BRANCH_AFTER=$(git -C "$REPO" rev-parse --abbrev-ref HEAD)
expect_exit  "review: restores the original branch" "other" "$BRANCH_AFTER"

# --- failure -----------------------------------------------------------------
OUT=$(cd "$REPO" && git checkout -q other && PATH="$MOCKBIN:$PATH" MOCK_NPM_EXIT=1 bash "$REVIEW" feature 2>&1); RC=$?
expect_exit  "review: lint failure" 1 "$RC"
expect_has   "review: failure names the check" "$OUT" "FAIL lint backend"
expect_has   "review: failure says do not merge" "$OUT" "DO NOT MERGE"

# --- warning -----------------------------------------------------------------
make_repo "$REPO"
commit_on_feature "$REPO" notes/debug.js 'console.log("hi");'
run_review "$REPO" feature
expect_exit  "review: warning only (console.log)" 2 "$RC"
expect_has   "review: warning wording" "$OUT" "NEEDS A LOOK"
expect_lacks "review: warning is not a pass" "$OUT" "ALL PERFORMED CHECKS PASSED"

# --- missing dependency (node_modules not installed) --------------------------
make_repo "$REPO"
commit_on_feature "$REPO" backend/src.js "const a = 1;"
run_review "$REPO" feature
expect_exit  "review: missing node_modules" 2 "$RC"
expect_has   "review: skipped check is listed" "$OUT" "SKIP"
expect_has   "review: skipped check is named" "$OUT" "lint backend (node_modules not installed)"
expect_has   "review: incomplete wording" "$OUT" "INCOMPLETE"
expect_lacks "review: skipped is never safe to merge" "$OUT" "SAFE TO MERGE"
expect_lacks "review: skipped is never a pass" "$OUT" "ALL PERFORMED CHECKS PASSED"

# --- missing lint script ------------------------------------------------------
make_repo "$REPO"
mkdir -p "$REPO/backend/node_modules"
echo '{"scripts":{}}' > "$REPO/backend/package.json"
(cd "$REPO" && git add -A && git commit -q -m "chore: base" && git push -q origin feature:main)
commit_on_feature "$REPO" backend/src.js "const a = 1;"
run_review "$REPO" feature
expect_exit  "review: service without a lint script" 2 "$RC"
expect_has   "review: missing lint script is reported" "$OUT" "no lint script"

# --- bad input ------------------------------------------------------------------
make_repo "$REPO"
commit_on_feature "$REPO" notes/a.txt "hello"
run_review "$REPO" no-such-branch
expect_exit  "review: unknown branch" 1 "$RC"

OUT=$(cd "$REPO" && git checkout -q other && PATH="$MOCKBIN:$PATH" BASE_REF=origin/nope bash "$REVIEW" feature 2>&1); RC=$?
expect_exit  "review: unknown base ref" 1 "$RC"
expect_has   "review: unknown base ref is explained" "$OUT" "Cannot find a merge base"

OUT=$(cd "$REPO" && PATH="$MOCKBIN:$PATH" bash "$REVIEW" 2>&1); RC=$?
expect_exit  "review: no argument prints usage" 1 "$RC"

# --- nothing to review --------------------------------------------------------------
make_repo "$REPO"
run_review "$REPO" feature
expect_exit  "review: no changes is incomplete, not a pass" 2 "$RC"
expect_has   "review: no changes says nothing was reviewed" "$OUT" "Nothing was reviewed"

# =============================================================================
echo
echo "RESULT"
echo "  Passed: $PASSED   Failed: $FAILED"
[ "$FAILED" -eq 0 ]