#!/usr/bin/env bash
# Acceptance check for Task 0.5: requests to / serve the frontend, requests to /api/*
# are actually forwarded to the backend container (not swallowed by the SPA fallback
# or nginx's own 404). No /api routes exist on the backend until Task 0.6, so this
# proves proxying by checking for Express's distinctive 404 body, not a 200.
set -uo pipefail
fail=0

echo "--- / should serve the frontend ---"
body=$(curl -sf http://localhost/)
if echo "$body" | grep -q '<title>Housing Society Management</title>'; then
  echo "OK: / serves the frontend HTML"
else
  echo "FAIL: / did not return expected frontend HTML"
  fail=1
fi

echo "--- /api/* should reach the backend, not the SPA fallback ---"
status=$(curl -s -o /tmp/api_probe_body -w "%{http_code}" http://localhost/api/some-nonexistent-route)
body=$(cat /tmp/api_probe_body)
if echo "$body" | grep -q '<title>Housing Society Management</title>'; then
  echo "FAIL: /api/* fell through to the SPA fallback (got frontend HTML) — not proxied"
  fail=1
elif [ "$status" = "404" ]; then
  echo "OK: /api/* reached the backend (Express 404 for unknown route, not nginx's fallback)"
else
  echo "FAIL: /api/* returned unexpected status $status, body: $body"
  fail=1
fi

exit $fail
