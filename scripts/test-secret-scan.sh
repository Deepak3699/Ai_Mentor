#!/usr/bin/env bash
#
# test-secret-scan.sh — proves the secret scanner in CI actually works.
#
# WHAT IT DOES
#   Builds throw-away git repos in a temp directory, plants FAKE credentials in
#   them, and checks that gitleaks (with this repo's .gitleaks.toml):
#     - passes on a clean repo and on placeholder values
#     - detects AWS keys, GitHub tokens, private keys, Slack webhooks and
#       database connection-string passwords
#     - detects a secret that was committed and then deleted (history scan)
#     - fails with a non-zero exit code
#     - never prints the secret value to the console or into the report
#     - honours a reviewed .gitleaksignore fingerprint
#
#   The fake secrets are assembled at runtime from fragments, so this file
#   itself never contains a string that looks like a real credential.
#
# USAGE
#   scripts/test-secret-scan.sh              # uses `gitleaks` from PATH
#   GITLEAKS_BIN=/path/to/gitleaks scripts/test-secret-scan.sh
#
# Exit code 0 = all checks passed, 1 = at least one check failed
# -----------------------------------------------------------------------------

set -uo pipefail

GITLEAKS_BIN="${GITLEAKS_BIN:-gitleaks}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="$ROOT/.gitleaks.toml"

if ! command -v "$GITLEAKS_BIN" >/dev/null 2>&1; then
  echo "gitleaks not found. Install it or set GITLEAKS_BIN." >&2
  exit 1
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

PASS=0
FAIL=0
ok()   { PASS=$((PASS + 1)); echo "  ok   - $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  FAIL - $1"; }

# ── fake credentials ─────────────────────────────────────────────────────────
# Stored REVERSED and flipped back at runtime, so this file never contains a
# string that looks like a real credential (and does not trip the scanner).
unrev() { printf '%s' "$1" | rev; }

AWS_KEY="$(unrev 'N3DWXKVZ7QTMPLYQ''AIKA')"
GH_TOKEN="$(unrev '9aXp2Yp0gSj6HjW4fW1cN7bV5mT2rZ9qLd3K8x''_phg')"
SLACK_HOOK="$(unrev '4Dc1By8Wt5Rv2Px9NmL3kZq7/54DCBA3210B/54DCBA3210T/secivres/moc.kcals.skooh//:sptth')"
DB_URL="$(unrev 'ppa/5432:gro.elpmaxe.lanretni.bd@4Lp9Vm2Kx7qZ:resu_ppa//:lqsergtsop')"
DB_PASS="$(unrev '4Lp9Vm2Kx7qZ')"
BODY="$(unrev 'jKc8sU9tUTJV7CQ1BAEoIgAjSwggSjAgEAAoIBAQC7VJTUt9')"
BODY="$(unrev 'uKfDvClWxMyQb4NjPiIoU6eA1sHtGr5ZwV8cFnXdY0qLk3bz')$(unrev "$BODY")"
KEY_BEGIN="-----BEGIN RSA PRIVATE"" KEY-----"
KEY_END="-----END RSA PRIVATE"" KEY-----"
PRIVATE_KEY="$KEY_BEGIN
$BODY
$BODY
$KEY_END"

new_repo() {
  local dir="$WORK/$1"
  mkdir -p "$dir"
  git -C "$dir" init -q
  git -C "$dir" config user.email "ci@example.invalid"
  git -C "$dir" config user.name "ci"
  git -C "$dir" config commit.gpgsign false
  echo "$dir"
}

commit_all() {
  git -C "$1" add -A
  git -C "$1" commit -q -m "$2"
}

# scan <repo> <mode: git|dir>  -> sets SCAN_EXIT, SCAN_OUT, SCAN_REPORT
scan() {
  local repo="$1" mode="$2"
  SCAN_REPORT="$WORK/report-$(basename "$repo")-$mode.json"
  local ignore=()
  [ -f "$repo/.gitleaksignore" ] && ignore=(--gitleaks-ignore-path "$repo/.gitleaksignore")
  SCAN_OUT="$("$GITLEAKS_BIN" "$mode" "$repo" \
    --config "$CONFIG" --redact --no-banner --no-color \
    --report-format json --report-path "$SCAN_REPORT" \
    "${ignore[@]}" 2>&1)"
  SCAN_EXIT=$?
}

assert_detected() {   # <label> <rule-id> <secret-value>
  local label="$1" rule="$2" secret="$3"
  if [ "$SCAN_EXIT" -ne 0 ] && grep -q "\"RuleID\": \"$rule\"" "$SCAN_REPORT" 2>/dev/null; then
    ok "$label detected ($rule) and scan failed"
  else
    fail "$label NOT detected as $rule (exit=$SCAN_EXIT)"
  fi
  if printf '%s\n%s' "$SCAN_OUT" "$(cat "$SCAN_REPORT" 2>/dev/null)" | grep -qF -- "$secret"; then
    fail "$label: secret value leaked into output/report"
  else
    ok "$label: secret value not echoed"
  fi
}

echo "Secret scan fixture tests (gitleaks $("$GITLEAKS_BIN" version 2>/dev/null))"

# ── 1. clean repo passes ─────────────────────────────────────────────────────
echo "[clean repo]"
R="$(new_repo clean)"
echo "console.log('hello');" > "$R/app.js"
commit_all "$R" "clean"
scan "$R" git
[ "$SCAN_EXIT" -eq 0 ] && ok "clean history passes" || fail "clean history flagged (exit=$SCAN_EXIT)"

# ── 2. placeholders are not findings ─────────────────────────────────────────
echo "[placeholders]"
R="$(new_repo placeholders)"
cat > "$R/.env.example" <<'PLACEHOLDERS'
NEON_DATABASE_URL=postgresql://neondb_owner:your_password@your_host/your_db
OTHER_URL=postgres://admin:password@localhost:5432/dbname
THIRD_URL=postgresql://user:xxxxx@ep-xxxxx.example.org/neondb
PLACEHOLDERS
commit_all "$R" "placeholders"
scan "$R" git
[ "$SCAN_EXIT" -eq 0 ] && ok "placeholder connection strings pass" || fail "placeholders flagged (exit=$SCAN_EXIT)"

# ── 3. each secret type, committed under an innocent filename ────────────────
detect_case() {   # <name> <filename> <content> <rule> <secret>
  echo "[$1]"
  local r
  r="$(new_repo "$1")"
  printf '%s\n' "$3" > "$r/$2"
  commit_all "$r" "add $1"
  scan "$r" git
  assert_detected "$1" "$4" "$5"
}

detect_case aws-key        config.js     "const awsKey = \"$AWS_KEY\";"                  aws-access-token             "$AWS_KEY"
detect_case github-token   deploy.sh     "export GH=\"$GH_TOKEN\""                        github-pat                   "$GH_TOKEN"
detect_case slack-webhook  notify.py     "WEBHOOK = \"$SLACK_HOOK\""                      slack-webhook-url            "$SLACK_HOOK"
detect_case db-credentials settings.json "{\"db\": \"$DB_URL\"}"                          connection-string-credentials "$DB_PASS"
detect_case private-key    notes.txt     "$PRIVATE_KEY"                                   private-key                  "$BODY"

# ── 4. working-tree (dir) scan catches uncommitted content too ───────────────
echo "[working tree]"
R="$(new_repo worktree)"
printf 'token=%s\n' "$GH_TOKEN" > "$R/readme.md"
scan "$R" dir
assert_detected "dir scan" github-pat "$GH_TOKEN"

# ── 5. a secret deleted in a later commit is still found in history ──────────
echo "[history]"
R="$(new_repo history)"
printf 'KEY=%s\n' "$AWS_KEY" > "$R/old.txt"
commit_all "$R" "oops"
git -C "$R" rm -q old.txt
commit_all "$R" "remove it"
scan "$R" git
assert_detected "deleted secret in history" aws-access-token "$AWS_KEY"

# ── 6. reviewed .gitleaksignore fingerprint suppresses exactly that finding ──
echo "[reviewed false positive]"
FP="$(grep -o '"Fingerprint": "[^"]*"' "$SCAN_REPORT" | head -1 | sed 's/.*: "//; s/"$//')"
if [ -n "$FP" ]; then
  printf '# test-only reviewed entry\n%s\n' "$FP" > "$R/.gitleaksignore"
  scan "$R" git
  [ "$SCAN_EXIT" -eq 0 ] && ok ".gitleaksignore fingerprint suppresses the finding" \
                         || fail ".gitleaksignore did not suppress (exit=$SCAN_EXIT)"
else
  fail "could not read a fingerprint from the report"
fi

# ── 7. the real repo's own config is valid and its tree is clean ─────────────
echo "[this repository]"
"$GITLEAKS_BIN" dir "$ROOT" --config "$CONFIG" --redact --no-banner --no-color >/dev/null 2>&1
[ $? -eq 0 ] && ok "current working tree has no findings" || fail "current working tree has findings (run the scan to see them)"

echo
echo "Passed: $PASS  Failed: $FAIL"
[ "$FAIL" -eq 0 ]
