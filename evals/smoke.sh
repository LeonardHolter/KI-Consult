#!/usr/bin/env bash
# Integration smoke test for the realtime voice-demo work: hits a *running*
# server with real HTTP requests, so it catches things the mocked unit evals
# (npm run eval) structurally cannot — real Next.js routing/middleware
# wiring, real env var configuration, a real OpenAI round-trip. This is the
# same set of checks that were run manually by hand throughout the session
# to verify each deploy; this script just makes them repeatable.
#
# Usage: evals/smoke.sh [base_url]   (defaults to http://localhost:3001)

set -uo pipefail

BASE="${1:-http://localhost:3001}"
PASS=0
FAIL=0

check() {
  local desc="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "  ok   - $desc"
    PASS=$((PASS + 1))
  else
    echo "  FAIL - $desc (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

echo "Smoke-testing $BASE"
echo

echo "-- unauthenticated access --"
status=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/login")
check "GET /login renders (no MIDDLEWARE_INVOCATION_FAILED)" "200" "$status"

status=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/portal")
check "GET /portal redirects (not a 500)" "307" "$status"

location=$(curl -s -o /dev/null -w "%{redirect_url}" "$BASE/portal")
check "GET /portal redirects to /login?next=/portal" "$BASE/login?next=%2Fportal" "$location"

echo
echo "-- public marketing demo (no auth required) --"
body=$(curl -s -X POST "$BASE/api/voice/session")
if echo "$body" | grep -q '"clientSecret"'; then
  echo "  ok   - POST /api/voice/session mints a real OpenAI client secret"
  PASS=$((PASS + 1))
else
  echo "  FAIL - POST /api/voice/session did not return a clientSecret: $body"
  FAIL=$((FAIL + 1))
fi

echo
echo "-- admin/portal routes reject unauthenticated requests (403, not 500) --"
status=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/portal/voice-agent/session" -H "Content-Type: application/json" -d '{}')
check "POST /api/portal/voice-agent/session -> 403" "403" "$status"

status=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/portal/voice-demo/settings")
check "GET /api/portal/voice-demo/settings -> 403" "403" "$status"

status=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/portal/voice-demo/settings?client=handzon-strommen")
check "GET /api/portal/voice-demo/settings?client=... -> 403" "403" "$status"

status=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/portal/voice-demo/test-session" -H "Content-Type: application/json" -d '{"instructions":"x"}')
check "POST /api/portal/voice-demo/test-session -> 403" "403" "$status"

echo
echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
