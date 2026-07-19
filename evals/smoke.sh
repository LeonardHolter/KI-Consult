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
echo "-- multi-tenant chat bot (migrated from handzon-clone, per-client via ?client=<uuid>) --"
HANDZON_ID="ad19951e-00e1-4293-8975-6c6bb1dbdad7"

status=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/embed.js")
check "GET /embed.js without ?client= -> 400" "400" "$status"

status=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/embed.js?client=00000000-0000-0000-0000-000000000000")
check "GET /embed.js?client=<unknown> -> 404" "404" "$status"

status=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/embed.js?client=$HANDZON_ID")
check "GET /embed.js?client=<handzon> -> 200" "200" "$status"

status=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/media/logo.webp")
check "GET /media/logo.webp serves" "200" "$status"

status=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/calendar-view")
check "GET /api/calendar-view without ?client= -> 400" "400" "$status"

body=$(curl -s "$BASE/api/calendar-view?client=$HANDZON_ID")
if echo "$body" | grep -q '"slots"'; then
  echo "  ok   - GET /api/calendar-view?client=<handzon> returns real slot data"
  PASS=$((PASS + 1))
else
  echo "  FAIL - GET /api/calendar-view?client=<handzon> did not return slots: $body"
  FAIL=$((FAIL + 1))
fi

status=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/chat" -H "Content-Type: application/json" -d '{"messages":[]}')
check "POST /api/chat without ?client= -> 400" "400" "$status"

origin=$(curl -s -X OPTIONS "$BASE/api/chat?client=$HANDZON_ID" -H "Origin: https://handzon.no" -D - -o /dev/null | grep -i "access-control-allow-origin" | tr -d '\r')
check "OPTIONS /api/chat?client=<handzon> allows https://handzon.no" "access-control-allow-origin: https://handzon.no" "$(echo "$origin" | tr 'A-Z' 'a-z')"

origin=$(curl -s -X OPTIONS "$BASE/api/chat?client=$HANDZON_ID" -H "Origin: https://evil-example.com" -D - -o /dev/null | grep -ci "access-control-allow-origin")
check "OPTIONS /api/chat?client=<handzon> blocks an untrusted origin" "0" "$origin"

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

status=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/portal/chat-bot/settings?client=$HANDZON_ID")
check "GET /api/portal/chat-bot/settings?client=... -> 403" "403" "$status"

status=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$BASE/api/portal/clients/$HANDZON_ID" -H "Content-Type: application/json" -d '{"status":"active"}')
check "PATCH /api/portal/clients/<id> -> 403" "403" "$status"

status=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/portal/voice-agent/usage" -H "Content-Type: application/json" -d '{}')
check "POST /api/portal/voice-agent/usage -> 403" "403" "$status"

status=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/portal/calendar?client=$HANDZON_ID")
check "GET /api/portal/calendar?client=... -> 403" "403" "$status"

status=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/portal/calendar" -H "Content-Type: application/json" -d "{\"clientId\":\"$HANDZON_ID\",\"calendarId\":\"x\"}")
check "POST /api/portal/calendar -> 403" "403" "$status"

status=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/api/portal/bookings" -H "Content-Type: application/json" -d "{\"clientId\":\"$HANDZON_ID\",\"bookingId\":\"x\"}")
check "DELETE /api/portal/bookings -> 403" "403" "$status"

echo
echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
