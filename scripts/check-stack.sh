#!/usr/bin/env bash
# Acceptance check for Task 0.4: after `docker compose up -d --build`, confirm each
# service reports the expected state. Exits non-zero (with a message pointing at the
# failure) if anything is wrong.
set -uo pipefail

fail=0

check_running() {
  local service="$1"
  local status
  status=$(docker compose ps --format json "$service" 2>/dev/null | grep -o '"State":"[a-z]*"' | head -1 | cut -d'"' -f4)
  if [ "$status" != "running" ]; then
    echo "FAIL: $service is not running (state: ${status:-not found})"
    fail=1
  else
    echo "OK: $service is running"
  fi
}

check_exited_zero() {
  local service="$1"
  local status exit_code
  status=$(docker compose ps -a --format json "$service" 2>/dev/null | grep -o '"State":"[a-z]*"' | head -1 | cut -d'"' -f4)
  exit_code=$(docker compose ps -a --format json "$service" 2>/dev/null | grep -o '"ExitCode":[0-9]*' | head -1 | cut -d':' -f2)
  if [ "$status" != "exited" ] || [ "$exit_code" != "0" ]; then
    echo "FAIL: $service did not exit cleanly (state: ${status:-not found}, exit code: ${exit_code:-n/a})"
    fail=1
  else
    echo "OK: $service completed its build-only run (exit 0)"
  fi
}

check_running postgres
check_running backend
check_exited_zero frontend
check_running nginx

echo "--- HTTP check ---"
if curl -sf http://localhost/ -o /dev/null; then
  echo "OK: http://localhost/ reachable via nginx"
else
  echo "FAIL: http://localhost/ not reachable"
  fail=1
fi

echo "--- frontend bundle: no leaked dev-only URLs (Task 2.7 regression check) ---"
# A dev-only client/.env (VITE_API_BASE_URL=http://localhost:3000, for running
# server/ and client/ as separate local processes) once leaked into the production
# Docker build because client/.dockerignore didn't exclude .env — Vite bakes env vars
# into the bundle at build time, so the deployed app tried calling localhost:3000 in
# every visitor's own browser instead of the real backend. Fixed by excluding .env
# from the build context; this check catches it if it ever regresses.
bundle_path=$(curl -s http://localhost/ | grep -oE 'src="[^"]*\.js"' | head -1 | sed 's/src="//;s/"//')
if [ -z "$bundle_path" ]; then
  echo "FAIL: could not find the frontend's JS bundle path in the served HTML"
  fail=1
elif curl -s "http://localhost${bundle_path}" | grep -q "localhost:3000"; then
  echo "FAIL: frontend bundle contains 'localhost:3000' — a dev-only env value leaked into the production build"
  fail=1
else
  echo "OK: frontend bundle does not contain dev-only localhost:3000"
fi

exit $fail
