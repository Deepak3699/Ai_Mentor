#!/usr/bin/env bash
#
# smoke-test.sh — is the stack still alive?
#
# WHAT IT DOES
#   Hits all five services and the most important API endpoints, then tells you
#   within seconds whether anything is broken.
#
#   Use it:
#     - every morning before the team starts
#     - right after merging anything risky
#     - when someone says "the app is not working"
#
# USAGE
#   ./smoke-test.sh              # checks everything
#   ./smoke-test.sh --quick      # only checks that the services are up
#
# REQUIREMENTS
#   curl, and the services running locally
#
# Exit code 0 = all good, 1 = something is broken
# -----------------------------------------------------------------------------

set -uo pipefail

if [ -t 1 ]; then
  RED=$'\033[31m'; YEL=$'\033[33m'; GRN=$'\033[32m'; BLU=$'\033[34m'; BLD=$'\033[1m'; DIM=$'\033[2m'; RST=$'\033[0m'
else
  RED=""; YEL=""; GRN=""; BLU=""; BLD=""; DIM=""; RST=""
fi

QUICK=0
[ "${1:-}" = "--quick" ] && QUICK=1

# Override these if your ports differ
BACKEND="${BACKEND_URL:-http://localhost:5000}"
ADMINAPI="${ADMINAPI_URL:-http://localhost:5001}"
FRONTEND="${FRONTEND_URL:-http://localhost:5173}"
ADMINUI="${ADMINUI_URL:-http://localhost:5174}"
AISERVICE="${AISERVICE_URL:-http://localhost:8000}"

PASS=0
FAIL=0
WARN=0

ok()   { echo "  ${GRN}PASS${RST} $1"; PASS=$((PASS+1)); }
bad()  { echo "  ${RED}FAIL${RST} $1"; [ -n "${2:-}" ] && echo "       ${DIM}$2${RST}"; FAIL=$((FAIL+1)); }
warn() { echo "  ${YEL}WARN${RST} $1"; [ -n "${2:-}" ] && echo "       ${DIM}$2${RST}"; WARN=$((WARN+1)); }

# status <url> [timeout] -> prints the HTTP code, or 000 if unreachable
status() {
  curl -s -o /dev/null -w "%{http_code}" --max-time "${2:-5}" "$1" 2>/dev/null
}

hr() { printf '%s\n' "--------------------------------------------------------------"; }

echo
echo "${BLD}AI MENTOR — SMOKE TEST${RST}"
echo "${DIM}$(date '+%Y-%m-%d %H:%M:%S')${RST}"
hr

# -----------------------------------------------------------------------------
echo
echo "${BLD}${BLU}SERVICES${RST}"
hr

check_service() {
  local name="$1" url="$2" expect="$3"
  local code
  code=$(status "$url")
  if [ "$code" = "$expect" ]; then
    ok "$name responding (HTTP $code)"
  elif [ "$code" = "000" ]; then
    bad "$name is DOWN" "No response from $url — is it running?"
  else
    warn "$name returned HTTP $code (expected $expect)" "$url"
  fi
}

check_service "backend       :5000"  "$BACKEND/"            200
check_service "backendAdmin  :5001"  "$ADMINAPI/health"     200
check_service "ai_service    :8000"  "$AISERVICE/"          200
check_service "frontend      :5173"  "$FRONTEND/"           200
check_service "frontendAdmin :5174"  "$ADMINUI/"            200

if [ "$QUICK" -eq 1 ]; then
  echo
  hr
  echo "  ${BLD}Quick mode — skipping API checks.${RST}"
  echo "  Passed: $PASS   Failed: $FAIL   Warnings: $WARN"
  [ "$FAIL" -gt 0 ] && exit 1
  exit 0
fi

# -----------------------------------------------------------------------------
echo
echo "${BLD}${BLU}PUBLIC API${RST}"
hr

# Courses list should be public
code=$(status "$BACKEND/api/courses")
if [ "$code" = "200" ]; then
  ok "GET /api/courses returns 200 (public endpoint works)"
else
  bad "GET /api/courses returned $code" "Course browsing is broken — users cannot see any courses"
fi

# Bad login should be rejected
code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 \
  -X POST "$BACKEND/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"nobody@nowhere.invalid","password":"wrongpassword"}' 2>/dev/null)
if [ "$code" = "401" ] || [ "$code" = "400" ] || [ "$code" = "404" ]; then
  ok "Login with bad credentials rejected (HTTP $code)"
elif [ "$code" = "000" ]; then
  bad "Login endpoint did not respond"
else
  warn "Login with bad credentials returned HTTP $code" "Expected 400 or 401 — check the auth controller"
fi

# -----------------------------------------------------------------------------
echo
echo "${BLD}${BLU}AUTH PROTECTION${RST}"
hr

# Protected routes must reject requests with no token
for path in "/api/users/watched-videos" "/api/notifications" "/api/analytics" "/api/assistant/context"; do
  code=$(status "$BACKEND$path")
  if [ "$code" = "401" ]; then
    ok "GET $path rejects unauthenticated requests (401)"
  elif [ "$code" = "000" ]; then
    warn "GET $path did not respond"
  elif [ "$code" = "500" ]; then
    warn "GET $path returned 500 without a token" "Expected 401 — the auth middleware may be broken"
  else
    bad "GET $path returned $code with NO token" "SECURITY: this endpoint should require authentication"
  fi
done

# Admin backend must reject no-token requests
code=$(status "$ADMINAPI/api/admin/users")
if [ "$code" = "401" ] || [ "$code" = "403" ]; then
  ok "Admin API rejects unauthenticated requests ($code)"
else
  warn "Admin API returned HTTP $code without a token" "Expected 401"
fi

# -----------------------------------------------------------------------------
echo
echo "${BLD}${BLU}AI SERVICE${RST}"
hr

code=$(status "$AISERVICE/docs")
if [ "$code" = "200" ]; then
  ok "Swagger docs available at :8000/docs"
else
  warn "Swagger docs returned HTTP $code"
fi

# Transcript endpoint — should NOT be open (known issue #19/#47)
code=$(status "$AISERVICE/transcript/does-not-exist.txt")
if [ "$code" = "400" ] || [ "$code" = "401" ] || [ "$code" = "403" ]; then
  ok "Transcript endpoint rejects bad input ($code)"
elif [ "$code" = "200" ]; then
  warn "Transcript endpoint returned 200 for a non-existent file" "Check issue #47 (path traversal)"
else
  ok "Transcript endpoint returns $code for a missing file"
fi

# Path traversal attempt
code=$(status "$AISERVICE/transcript/..%2F..%2F.env")
if [ "$code" = "200" ]; then
  bad "PATH TRAVERSAL WORKS — /transcript/..%2F..%2F.env returned 200" "CRITICAL: issue #47 is NOT fixed. Server files are readable."
else
  ok "Path traversal blocked (returned $code)"
fi

# -----------------------------------------------------------------------------
echo
echo "${BLD}${BLU}FRONTEND ASSETS${RST}"
hr

for path in "/" ; do
  body=$(curl -s --max-time 5 "$FRONTEND$path" 2>/dev/null)
  if echo "$body" | grep -qi "<div id=\"root\"\|<!doctype html"; then
    ok "Frontend serves the app shell"
  else
    warn "Frontend did not return expected HTML" "The Vite dev server may still be starting"
  fi
done

# -----------------------------------------------------------------------------
echo
hr
echo "${BLD}RESULT${RST}"
echo "  Passed  : ${GRN}$PASS${RST}"
echo "  Warnings: ${YEL}$WARN${RST}"
echo "  Failed  : ${RED}$FAIL${RST}"
echo

if [ "$FAIL" -gt 0 ]; then
  echo "${RED}${BLD}  SOMETHING IS BROKEN — do not start merging until this is green${RST}"
  echo
  exit 1
elif [ "$WARN" -gt 0 ]; then
  echo "${YEL}${BLD}  USABLE, with warnings — look at the WARN lines above${RST}"
  echo
  exit 0
else
  echo "${GRN}${BLD}  ALL GREEN — the stack is healthy${RST}"
  echo
  exit 0
fi
