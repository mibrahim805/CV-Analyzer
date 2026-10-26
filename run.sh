#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="${ROOT_DIR}/.run"
mkdir -p "${LOG_DIR}"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required to run the local infrastructure." >&2
  exit 1
fi

if ! command -v corepack >/dev/null 2>&1; then
  echo "corepack (Node.js) is required to run the frontend." >&2
  exit 1
fi

if [[ -x "${ROOT_DIR}/apps/api/.venv/bin/python" ]]; then
  PYTHON_BIN="${ROOT_DIR}/apps/api/.venv/bin/python"
elif [[ -x "${ROOT_DIR}/.venv/bin/python" ]]; then
  PYTHON_BIN="${ROOT_DIR}/.venv/bin/python"
else
  echo "No project Python environment found. Create .venv or apps/api/.venv first." >&2
  exit 1
fi

export APP_ENV="${APP_ENV:-development}"
export APP_SECRET_KEY="${APP_SECRET_KEY:-development-only-secret-change-me-now}"
export DATABASE_URL="${DATABASE_URL:-postgresql+asyncpg://career:career@127.0.0.1:55432/career}"
export DATABASE_URL_SYNC="${DATABASE_URL_SYNC:-postgresql+psycopg://career:career@127.0.0.1:55432/career}"
export REDIS_URL="${REDIS_URL:-redis://127.0.0.1:56379/0}"
export OBJECT_STORAGE_ENDPOINT="${OBJECT_STORAGE_ENDPOINT:-http://127.0.0.1:9090}"
export OBJECT_STORAGE_PUBLIC_ENDPOINT="${OBJECT_STORAGE_PUBLIC_ENDPOINT:-http://127.0.0.1:9090}"
export OBJECT_STORAGE_ACCESS_KEY="${OBJECT_STORAGE_ACCESS_KEY:-career-local}"
export OBJECT_STORAGE_SECRET_KEY="${OBJECT_STORAGE_SECRET_KEY:-career-local-secret}"
export CLAMAV_HOST="${CLAMAV_HOST:-127.0.0.1}"
export CLAMAV_PORT="${CLAMAV_PORT:-3310}"
export GREENHOUSE_BOARD_TOKENS="${GREENHOUSE_BOARD_TOKENS:-}"
export LEVER_SITE_NAMES="${LEVER_SITE_NAMES:-}"
export AI_PROVIDER="${AI_PROVIDER:-none}"
export AI_API_URL="${AI_API_URL:-https://api.openai.com/v1/chat/completions}"
export AI_API_KEY="${AI_API_KEY:-}"
export AI_MODEL_NAME="${AI_MODEL_NAME:-}"
export AI_TIMEOUT_SECONDS="${AI_TIMEOUT_SECONDS:-30}"
export WEB_ORIGIN="${WEB_ORIGIN:-http://127.0.0.1:3000}"
export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-http://127.0.0.1:8000/api/v1}"

cd "${ROOT_DIR}"

echo "Starting local infrastructure..."
docker compose up -d --wait postgres redis object-storage clamav

echo "Waiting for database migrations..."
(cd "${ROOT_DIR}/apps/api" && "${PYTHON_BIN}" -m alembic upgrade head)

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM
  echo
  echo "Stopping application servers..."
  for pid in "${API_PID:-}" "${WEB_PID:-}"; do
    if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
      kill "${pid}" 2>/dev/null || true
    fi
  done
  if [[ -n "${WORKER_PID:-}" ]] && kill -0 "${WORKER_PID}" 2>/dev/null; then
    kill -- "-${WORKER_PID}" 2>/dev/null || kill "${WORKER_PID}" 2>/dev/null || true
  fi
  wait "${API_PID:-}" "${WORKER_PID:-}" "${WEB_PID:-}" 2>/dev/null || true
  exit "${exit_code}"
}
trap cleanup EXIT INT TERM

echo "Starting API from main.py on http://127.0.0.1:8000 ..."
"${PYTHON_BIN}" "${ROOT_DIR}/main.py" >"${LOG_DIR}/api.log" 2>&1 &
API_PID=$!

echo "Starting background worker..."
WORKER_HOSTNAME="career-pilot-${BASHPID}@%h"
(cd "${ROOT_DIR}/apps/api" && exec setsid "${PYTHON_BIN}" -m celery -A app.workers.celery_app worker --loglevel=INFO --hostname="${WORKER_HOSTNAME}") >"${LOG_DIR}/worker.log" 2>&1 &
WORKER_PID=$!

api_ready=false
for _ in {1..60}; do
  if curl --fail --silent http://127.0.0.1:8000/health/ready >/dev/null 2>&1; then
    api_ready=true
    break
  fi
  if ! kill -0 "${API_PID}" 2>/dev/null; then
    echo "API exited before becoming ready. See ${LOG_DIR}/api.log" >&2
    cat "${LOG_DIR}/api.log" >&2 || true
    exit 1
  fi
  sleep 1
done

if [[ "${api_ready}" != true ]]; then
  echo "API did not become ready within 60 seconds. See ${LOG_DIR}/api.log" >&2
  exit 1
fi

echo "Starting frontend on http://127.0.0.1:3000 ..."
corepack pnpm --filter web dev --hostname 127.0.0.1 --port 3000 >"${LOG_DIR}/web.log" 2>&1 &
WEB_PID=$!

echo ""
echo "CareerPilot is running:"
echo "  Frontend: http://127.0.0.1:3000"
echo "  API:      http://127.0.0.1:8000"
echo "  API docs: http://127.0.0.1:8000/api/v1/docs"
echo ""
echo "Logs: ${LOG_DIR}/api.log, ${LOG_DIR}/worker.log, and ${LOG_DIR}/web.log"
echo "Press Ctrl+C to stop the application servers."

while kill -0 "${API_PID}" 2>/dev/null && kill -0 "${WORKER_PID}" 2>/dev/null && kill -0 "${WEB_PID}" 2>/dev/null; do
  sleep 1
done

if ! kill -0 "${API_PID}" 2>/dev/null; then
  echo "API stopped unexpectedly. See ${LOG_DIR}/api.log" >&2
elif ! kill -0 "${WORKER_PID}" 2>/dev/null; then
  echo "Worker stopped unexpectedly. See ${LOG_DIR}/worker.log" >&2
else
  echo "Frontend stopped unexpectedly. See ${LOG_DIR}/web.log" >&2
fi
exit 1
