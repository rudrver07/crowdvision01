Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "Starting CrowdVision Platform Services..." -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan

Start-Process powershell -ArgumentList "-NoExit", "-Command", "python -m uvicorn app.main:app --app-dir ai_agent --host 127.0.0.1 --port 8100"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "python -m uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm --prefix frontend run dev -- --host 0.0.0.0 --port 5173"

Start-Sleep -Seconds 3
Start-Process "http://localhost:8000"
Write-Host "CrowdVision is live at http://localhost:8000 and http://localhost:5173" -ForegroundColor Green
