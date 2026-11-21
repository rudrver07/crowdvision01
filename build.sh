#!/usr/bin/env bash
# exit on error
set -o errexit

echo "=== Upgrading pip and installing Python dependencies ==="
pip install --upgrade pip
pip install -r requirements.txt

echo "=== Checking Node.js for Frontend build ==="
if command -v npm &> /dev/null; then
    echo "Node.js detected. Building frontend SPA..."
    cd frontend
    npm install
    npm run build
    cd ..
else
    echo "Note: Node.js not detected in native environment. Use Docker runtime for full-stack build."
fi
