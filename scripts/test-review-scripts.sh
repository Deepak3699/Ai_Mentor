#!/usr/bin/env bash
#
# test-review-scripts.sh — proves review-pr.sh and smoke-test.sh report honestly.
#
# WHAT IT DOES
#   Runs both scripts against throw-away git repos and a fake `curl` / `npm` /
#   `gh` (no real services, no network) and checks the exit code and wording:
#     - pass / failure / warning / missing dependency (exit 0 / 1 / 2 / 2)
#     - smoke-test status handling: which 4xx codes are safe, and that
#       redirects, 5xx and odd statuses never count as passes
#     - review-pr.sh safety: refuses to start over uncommitted or untracked
#       work, restores your branch (detached HEAD, Ctrl+C, checkout failure,
#       restore failure) and never touches ignored files
#     - review-pr.sh base branch: fetched first, exact commit printed, stale
#       local copies flagged
#   The harness itself is strict (set -euo pipefail): an unexpected error aborts
#   the run, and only the exit codes a test expects are captured (see `capture`).
#
# USAGE
#   scripts/test-review-scripts.sh
#
# Exit code 0 = all checks passed, 1 = at least one check failed
# -----------------------------------------------------------------------------

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REVIEW="$ROOT/scripts/review-pr.sh"
SMOKE="$ROOT/scripts/smoke-test.sh"
SELF="${BASH_SOURCE[0]}"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

PASSED=0
FAILED=0
OUT=""
RC=0

pass() { echo "  PASS $1"; PASSED=$((PASSED+1)); }
fail() { echo "  FAIL $1"; FAILED=$((FAILED+1)); }

# expect_exit <description> <wanted> <got>
expect_exit() {
  if [ "$2" = "$3" ]; then pass "$1 (exit $3)"; else fail "$1 (wanted exit $2, got $3)"; fi
}
# expect_same <description> <wanted> <got>
expect_same() {
  if [ "$2" = "$3" ]; then pass "$1"; else fail "$1 (wanted '$2', got '$3')"; fi
}
# expect_has / expect_lacks <description> <text> <needle>
expect_has() {
  if grep -qF -- "$3" <<<"$2"; then pass "$1"; else fail "$1 (missing: $3)"; fi
}
expect_lacks() {
  if grep -qF -- "$3" <<<"$2"; then fail "$1 (found: $3)"; else pass "$1"; fi
}

# capture <command...> — run a command that is EXPECTED to maybe exit nonzero.
# Sets OUT (stdout+stderr) and RC (exit code). Everything else stays fatal.
capture() {
  RC=0
  OUT=$("$@" 2>&1) || RC=$?
}

# -----------------------------------------------------------------------------
# Fake tools (prepended to PATH only for the scripts under test)
# -----------------------------------------------------------------------------
MOCKBIN="$WORK/mockbin"
GITWRAP="$WORK/gitwrap"
mkdir -p "$MOCKBIN" "$GITWRAP"

# npm: exit code from MOCK_NPM_EXIT; optional sleep and "I started" marker
cat > "$MOCKBIN/npm" <<'EOF'
#!/usr/bin/env bash
if [ -n "${MOCK_NPM_MARKER:-}" ]; then : > "$MOCK_NPM_MARKER"; fi
if [ -n "${MOCK_NPM_SLEEP:-}" ]; then sleep "$MOCK_NPM_SLEEP"; fi
exit "${MOCK_NPM_EXIT:-0}"
EOF

# gh pr checkout <n>: checks out MOCK_GH_BRANCH, or fails when MOCK_GH_FAIL=1
cat > "$MOCKBIN/gh" <<'EOF'
#!/usr/bin/env bash
if [ "${MOCK_GH_FAIL:-0}" = "1" ]; then exit 1; fi
exec git checkout -q "${MOCK_GH_BRANCH:-feature}"
EOF

# curl: answers from MOCK_CURL_RULES ("<exact url>=<code>" per line, first match
# wins), otherwise 200. Code 000 mimics "unreachable".
cat > "$MOCKBIN/curl" <<'EOF'
#!/usr/bin/env bash
url=""; want_code=0
for a in "$@"; do
  case "$a" in
    http*) url="$a" ;;
    '%{http_code}') want_code=1 ;;
  esac
done
code=200
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

# git wrapper: fails `git checkout <MOCK_GIT_FAIL_CHECKOUT>` to simulate a
# restore failure; everything else goes to the real git.
cat > "$GITWRAP/git" <<'EOF'
#!/usr/bin/env bash
if [ "${1:-}" = "checkout" ] && [ -n "${MOCK_GIT_FAIL_CHECKOUT:-}" ]; then
  for a in "$@"; do
    if [ "$a" = "$MOCK_GIT_FAIL_CHECKOUT" ]; then exit 1; fi
  done
fi
exec "$REAL_GIT" "$@"
EOF
chmod +x "$MOCKBIN"/* "$GITWRAP/git"
REAL_GIT="$(command -v git)"
export REAL_GIT

# =============================================================================
echo
echo "STATIC CHECKS"
# =============================================================================

for f in "$REVIEW" "$SMOKE" "$SELF"; do
  name="$(basename "$f")"
  if grep -q '^set -euo pipefail$' "$f"; then
    pass "$name stops on unexpected failures (set -euo pipefail)"
  else
    fail "$name must use set -euo pipefail"
  fi
done
for f in "$REVIEW" "$SMOKE"; do
  name="$(basename "$f")"
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

TRANSCRIPT="http://ai.test/transcript/does-not-exist.txt"
TRAVERSAL="http://ai.test/transcript/..%2F..%2F.env"

HEALTHY_RULES="http://backend.test/api/auth/login=401
http://backend.test/api/users/watched-videos=401
http://backend.test/api/notifications=401
http://backend.test/api/analytics=401
http://backend.test/api/assistant/context=401
http://admin.test/api/admin/users=401
$TRANSCRIPT=404
$TRAVERSAL=404"

# run_smoke <override rules> [script args...]
run_smoke() {
  local overrides="$1"; shift
  capture env PATH="$MOCKBIN:$PATH" MOCK_CURL_RULES="$overrides"$'\n'"$HEALTHY_RULES" bash "$SMOKE" "$@"
}

# check_codes <rule url> <label> <wanted exit> <codes...>
check_codes() {
  local url="$1" label="$2" want="$3"; shift 3
  local c
  for c in "$@"; do
    run_smoke "$url=$c"
    expect_exit "smoke: $label HTTP $c" "$want" "$RC"
  done
}

run_smoke ""
expect_exit "smoke: all healthy" 0 "$RC"
expect_has  "smoke: all healthy says ALL GREEN" "$OUT" "ALL GREEN"

run_smoke "http://backend.test/=000"
expect_exit "smoke: service down" 1 "$RC"
expect_has  "smoke: service down is reported" "$OUT" "is DOWN"

check_codes "http://backend.test/api/courses" "courses" 1 500
check_codes "http://backend.test/api/notifications" "unprotected notifications" 1 200

run_smoke "http://ai.test/docs=500"
expect_exit "smoke: warnings only" 2 "$RC"
expect_has  "smoke: warnings are not called green" "$OUT" "USABLE, with warnings"
expect_lacks "smoke: warnings are not ALL GREEN" "$OUT" "ALL GREEN"

# Transcript (missing file): safe 4xx pass; 5xx fails; everything else warns
check_codes "$TRANSCRIPT" "transcript safe rejection" 0 400 401 403 404
check_codes "$TRANSCRIPT" "transcript server error" 1 500 502 503
check_codes "$TRANSCRIPT" "transcript redirect/odd status" 2 100 200 204 301 302 405 418 422 000
run_smoke "$TRANSCRIPT=500"
expect_has  "smoke: transcript 500 is reported" "$OUT" "returned a server error (500)"

# Path traversal: safe 4xx pass; success or 5xx fails; redirects/odd warn
check_codes "$TRAVERSAL" "traversal safe rejection" 0 400 401 403 404
check_codes "$TRAVERSAL" "traversal served or error" 1 200 204 500 503
check_codes "$TRAVERSAL" "traversal redirect/odd status" 2 100 301 302 405 422 000

run_smoke "http://backend.test/api/courses=500" --quick
expect_exit "smoke --quick: skips API checks, services up" 0 "$RC"
expect_has  "smoke --quick: says API checks were not run" "$OUT" "API checks were not run"
run_smoke "http://admin.test/health=503" --quick
expect_exit "smoke --quick: warning" 2 "$RC"
run_smoke "http://front.test/=000" --quick
expect_exit "smoke --quick: service down" 1 "$RC"

# Missing dependency: no curl on PATH at all
EMPTYBIN="$WORK/emptybin"; mkdir -p "$EMPTYBIN"
capture env PATH="$EMPTYBIN" "$BASH" "$SMOKE"
expect_exit "smoke: curl missing" 1 "$RC"
expect_has  "smoke: curl missing says no checks ran" "$OUT" "no checks could be run"

# =============================================================================
echo
echo "REVIEW-PR"
# =============================================================================

export GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test@example.com
export GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test@example.com

REPO="$WORK/repo"
START=other

# make_repo — repo with origin/main, ignored node_modules, branches other/feature
make_repo() {
  rm -rf "$REPO" "$REPO.git"
  git init -q --bare "$REPO.git"
  git -C "$REPO.git" symbolic-ref HEAD refs/heads/main
  git init -q "$REPO"
  git -C "$REPO" symbolic-ref HEAD refs/heads/main
  git -C "$REPO" config commit.gpgsign false
  git -C "$REPO" config core.autocrlf false
  mkdir -p "$REPO/backend" "$REPO/notes"
  echo '{"scripts":{"lint":"eslint ."}}' > "$REPO/backend/package.json"
  echo '{}' > "$REPO/backend/package-lock.json"
  echo 'node_modules/' > "$REPO/.gitignore"
  echo base > "$REPO/README.md"
  git -C "$REPO" add -A
  git -C "$REPO" commit -q -m "chore: base"
  git -C "$REPO" remote add origin "$REPO.git"
  git -C "$REPO" push -q origin main
  git -C "$REPO" branch other
  git -C "$REPO" checkout -q -b feature
}

# install_deps — fake installed dependencies (ignored by git) with a marker file
install_deps() {
  mkdir -p "$REPO/backend/node_modules"
  echo keep > "$REPO/backend/node_modules/keep.txt"
}

# commit_on_feature <file> <content> [message]
commit_on_feature() {
  mkdir -p "$(dirname "$REPO/$1")"
  printf '%s\n' "$2" > "$REPO/$1"
  git -C "$REPO" add -A
  git -C "$REPO" commit -q -m "${3:-feat: change}"
}

head_of()  { git -C "$REPO" rev-parse --abbrev-ref HEAD; }
short12()  { git -C "$REPO" rev-parse "$1" | cut -c1-12; }

# run_review [VAR=value ...] -- <script args>   (starts from $START, in $REPO)
run_review() {
  local envs=()
  while [ "$1" != "--" ]; do envs+=("$1"); shift; done
  shift
  if [ "$START" = "detached" ]; then
    git -C "$REPO" checkout -q --detach other
  else
    git -C "$REPO" checkout -q other
  fi
  RC=0
  OUT=$(cd "$REPO" && env PATH="$MOCKBIN:$PATH" ${envs[@]+"${envs[@]}"} bash "$REVIEW" "$@" 2>&1) || RC=$?
}

# --- pass ---------------------------------------------------------------------
make_repo; install_deps
commit_on_feature backend/src.js "const a = 1;"
run_review -- feature
expect_exit  "review: everything ran and passed" 0 "$RC"
expect_has   "review: lists the lint check that ran" "$OUT" "lint backend"
expect_has   "review: pass wording names performed checks" "$OUT" "ALL PERFORMED CHECKS PASSED"
expect_lacks "review: never claims SAFE TO MERGE" "$OUT" "SAFE TO MERGE"
expect_has   "review: says automated tests were not run" "$OUT" "Not run by this script: automated tests"
expect_has   "review: prints the exact base commit" "$OUT" "Base: origin/main = $(short12 origin/main)"
expect_same  "review: restores the original branch" other "$(head_of)"
expect_same  "review: leaves ignored files untouched" keep "$(cat "$REPO/backend/node_modules/keep.txt")"

# --- failure ------------------------------------------------------------------
run_review MOCK_NPM_EXIT=1 -- feature
expect_exit  "review: lint failure" 1 "$RC"
expect_has   "review: failure names the check" "$OUT" "FAIL lint backend"
expect_has   "review: failure says do not merge" "$OUT" "DO NOT MERGE"
expect_same  "review: restores the branch after a failure" other "$(head_of)"

# --- warning ------------------------------------------------------------------
make_repo
commit_on_feature notes/debug.js 'console.log("hi");'
run_review -- feature
expect_exit  "review: warning only (console.log)" 2 "$RC"
expect_has   "review: warning wording" "$OUT" "NEEDS A LOOK"
expect_lacks "review: warning is not a pass" "$OUT" "ALL PERFORMED CHECKS PASSED"

# --- missing dependency ---------------------------------------------------------
make_repo
commit_on_feature backend/src.js "const a = 1;"
run_review -- feature
expect_exit  "review: missing node_modules" 2 "$RC"
expect_has   "review: skipped check is named" "$OUT" "lint backend (node_modules not installed)"
expect_has   "review: incomplete wording" "$OUT" "INCOMPLETE"
expect_lacks "review: skipped is never safe to merge" "$OUT" "SAFE TO MERGE"
expect_lacks "review: skipped is never a pass" "$OUT" "ALL PERFORMED CHECKS PASSED"

make_repo; install_deps
echo '{"scripts":{}}' > "$REPO/backend/package.json"
git -C "$REPO" add -A; git -C "$REPO" commit -q -m "chore: no lint script"
git -C "$REPO" push -q origin feature:main
commit_on_feature backend/src.js "const a = 1;"
run_review -- feature
expect_exit  "review: service without a lint script" 2 "$RC"
expect_has   "review: missing lint script is reported" "$OUT" "no lint script"

# --- nothing to review ------------------------------------------------------------
make_repo
run_review -- feature
expect_exit  "review: no changes is incomplete, not a pass" 2 "$RC"
expect_has   "review: no changes says nothing was reviewed" "$OUT" "Nothing was reviewed"

# --- bad input and checkout failures --------------------------------------------------
make_repo
commit_on_feature notes/a.txt "hello"
run_review -- no-such-branch
expect_exit  "review: unknown branch" 1 "$RC"
expect_same  "review: unknown branch leaves you on your branch" other "$(head_of)"
run_review --
expect_exit  "review: no argument prints usage" 1 "$RC"
run_review MOCK_GH_FAIL=1 -- 123
expect_exit  "review: gh checkout failure" 1 "$RC"
expect_has   "review: gh checkout failure is explained" "$OUT" "Could not check out PR #123"
expect_same  "review: gh checkout failure leaves you on your branch" other "$(head_of)"
run_review MOCK_GH_BRANCH=feature -- 123
expect_exit  "review: PR whose branch already exists locally" 0 "$RC"
expect_same  "review: PR mode restores the original branch" other "$(head_of)"

# --- local work is never touched -----------------------------------------------------------
echo "my local edit" >> "$REPO/README.md"
BEFORE=$(cat "$REPO/README.md")
run_review -- feature
# run_review switched to `other` first; the edit travels with the checkout
expect_exit  "review: refuses to start over uncommitted changes" 1 "$RC"
expect_has   "review: dirty tree message" "$OUT" "uncommitted or untracked"
expect_same  "review: dirty tree keeps your branch" other "$(head_of)"
expect_same  "review: dirty tree keeps your edit" "$BEFORE" "$(cat "$REPO/README.md")"
git -C "$REPO" checkout -q -- README.md

echo "scratch notes" > "$REPO/scratch.txt"
run_review -- feature
expect_exit  "review: refuses to start over untracked files" 1 "$RC"
expect_same  "review: untracked file is left alone" "scratch notes" "$(cat "$REPO/scratch.txt")"
expect_same  "review: untracked file keeps your branch" other "$(head_of)"
rm -f "$REPO/scratch.txt"

# --- restore edge cases ------------------------------------------------------------------------
make_repo; install_deps
commit_on_feature backend/src.js "const a = 1;"
START=detached run_review -- feature
expect_exit  "review: detached HEAD start" 0 "$RC"
expect_same  "review: detached HEAD restored to the same commit" "$(git -C "$REPO" rev-parse other)" "$(git -C "$REPO" rev-parse HEAD)"
if git -C "$REPO" symbolic-ref -q HEAD >/dev/null; then fail "review: detached HEAD stays detached"; else pass "review: detached HEAD stays detached"; fi

run_review PATH="$GITWRAP:$MOCKBIN:$PATH" MOCK_GIT_FAIL_CHECKOUT=other -- feature
expect_exit  "review: failure to restore the branch is an error" 1 "$RC"
expect_has   "review: restore failure tells you the command to run" "$OUT" "git checkout other"
expect_same  "review: restore failure leaves the PR branch checked out" feature "$(head_of)"

# Interruption: SIGTERM while a check is running must still restore the branch
git -C "$REPO" checkout -q other
MARK="$WORK/npm-started"
pushd "$REPO" >/dev/null
PATH="$MOCKBIN:$PATH" MOCK_NPM_SLEEP=2 MOCK_NPM_MARKER="$MARK" bash "$REVIEW" feature >"$WORK/interrupt.out" 2>&1 &
PID=$!
popd >/dev/null
for _ in $(seq 1 100); do
  if [ -f "$MARK" ]; then break; fi
  sleep 0.1
done
kill -TERM "$PID"
RC=0; wait "$PID" || RC=$?
OUT=$(cat "$WORK/interrupt.out")
expect_exit  "review: interrupted (SIGTERM)" 143 "$RC"
expect_has   "review: interrupted run says it is returning" "$OUT" "Returning to: other"
expect_same  "review: interrupted run restores the branch" other "$(head_of)"

# --- base branch is current ---------------------------------------------------------------------
make_repo
commit_on_feature notes/a.txt "hello"
OLD_TIP=$(short12 origin/main)
git clone -q -b main "$REPO.git" "$WORK/pusher"
git -C "$WORK/pusher" config commit.gpgsign false
echo new > "$WORK/pusher/newfile.txt"
git -C "$WORK/pusher" add -A
git -C "$WORK/pusher" commit -q -m "chore: advance main"
git -C "$WORK/pusher" push -q origin main
NEW_TIP=$(git -C "$WORK/pusher" rev-parse HEAD | cut -c1-12)
run_review NO_FETCH=1 -- feature
expect_exit  "review: NO_FETCH uses the local base and warns" 2 "$RC"
expect_has   "review: NO_FETCH prints the (stale) base commit" "$OUT" "Base: origin/main = $OLD_TIP"
expect_has   "review: NO_FETCH says the base may be stale" "$OUT" "may be stale"
run_review -- feature
expect_exit  "review: stale base is fetched first" 0 "$RC"
expect_has   "review: fetched base commit is printed" "$OUT" "Base: origin/main = $NEW_TIP"
git -C "$REPO" remote set-url origin "$WORK/missing.git"
run_review -- feature
expect_exit  "review: fetch failure stops the review" 1 "$RC"
expect_has   "review: fetch failure is explained" "$OUT" "Could not fetch origin/main"
expect_same  "review: fetch failure leaves you on your branch" other "$(head_of)"
git -C "$REPO" remote set-url origin "$REPO.git"
run_review BASE_REF=origin/nope NO_FETCH=1 -- feature
expect_exit  "review: unknown base ref" 1 "$RC"
expect_has   "review: unknown base ref is explained" "$OUT" "Cannot find a merge base"
git -C "$REPO" remote add upstream "$REPO.git"
run_review -- feature
expect_has   "review: upstream/main is the default base when it exists" "$OUT" "Base: upstream/main"
run_review BASE_REF=main -- feature
expect_exit  "review: local-only base is not fetched" 2 "$RC"
expect_has   "review: local-only base warns" "$OUT" "not a remote branch"

# =============================================================================
echo
echo "RESULT"
echo "  Passed: $PASSED   Failed: $FAILED"
[ "$FAILED" -eq 0 ]