@echo off
title CrowdVision Platform Launcher
echo ===================================================
echo Starting CrowdVision Platform Services...
echo ===================================================

start "CrowdVision AI Agent (:8100)" cmd /k "python -m uvicorn app.main:app --app-dir ai_agent --host 127.0.0.1 --port 8100"
start "CrowdVision Backend & Web App (:8000)" cmd /k "python -m uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000"
start "CrowdVision Frontend Dev Server (:5173)" cmd /k "npm --prefix frontend run dev -- --host 0.0.0.0 --port 5173"

echo Waiting for services to initialize...
timeout /t 3 /nobreak >nul
start http://localhost:8000
echo CrowdVision is live at http://localhost:8000 and http://localhost:5173
