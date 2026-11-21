#!/bin/sh
set -e

echo "=== Starting CrowdVision AI Agent subsystem on 127.0.0.1:8100 ==="
python -m uvicorn app.main:app --app-dir ai_agent --host 127.0.0.1 --port 8100 &

echo "=== Starting CrowdVision Primary Web Application on 0.0.0.0:${PORT:-10000} ==="
exec python -m uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port "${PORT:-10000}"
