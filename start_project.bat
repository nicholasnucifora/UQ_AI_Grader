@echo off
setlocal enabledelayedexpansion

echo ============================================
echo   AI Ripple Grader
echo ============================================
echo.

:: ── Check Python ──────────────────────────────────────────────────────────
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python not found.
    echo         Download and install from: https://www.python.org/downloads/
    echo         Make sure to tick "Add Python to PATH" during install.
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('python --version 2^>^&1') do set PYTHON_VER=%%i
echo [OK] %PYTHON_VER%

:: ── Check Node.js ─────────────────────────────────────────────────────────
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found.
    echo         Download and install from: https://nodejs.org/en/download
    echo         Install the LTS version, click through with defaults.
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version 2^>^&1') do set NODE_VER=%%i
echo [OK] Node.js %NODE_VER%

:: ── Backend .env ──────────────────────────────────────────────────────────
if not exist "backend\.env" (
    if exist "backend\.env.example" (
        copy "backend\.env.example" "backend\.env" >nul
        echo [SETUP] Created backend\.env from .env.example
        echo.
        echo         !! Open backend\.env and fill in your ANTHROPIC_API_KEY !!
        echo         Then re-run this file.
        echo.
        pause
        exit /b 1
    ) else (
        echo [ERROR] backend\.env is missing. Create it from backend\.env.example.
        pause
        exit /b 1
    )
)
echo [OK] backend\.env exists

:: Warn if API key looks empty or placeholder
findstr /i "ANTHROPIC_API_KEY=sk-" "backend\.env" >nul 2>&1
if %errorlevel% neq 0 (
    echo [WARN] ANTHROPIC_API_KEY doesn't look set in backend\.env
    echo        The app will start but AI grading won't work until it's filled in.
    echo.
)

:: ── Frontend .env ─────────────────────────────────────────────────────────
if not exist "frontend\.env.local" (
    if exist "frontend\.env.example" (
        copy "frontend\.env.example" "frontend\.env.local" >nul
        echo [SETUP] Created frontend\.env.local from .env.example
    )
)
echo [OK] frontend\.env.local exists

:: ── First-run notice ──────────────────────────────────────────────────────
if not exist "frontend\node_modules" (
    echo.
    echo [INFO] First run detected - npm install will run now and may take
    echo        a few minutes. Subsequent starts will be much faster.
)
echo.
echo Starting services...
echo.

:: ── Frontend ──────────────────────────────────────────────────────────────
start "Frontend (Vite)" cmd /k "cd frontend && npm install && npm run dev"

:: ── Backend: install deps + run migrations + start API ────────────────────
start "Backend (FastAPI)" cmd /k "cd backend && pip install -r requirements.txt && alembic upgrade head && uvicorn app.main:app --reload"

:: ── Worker ────────────────────────────────────────────────────────────────
start "Worker" cmd /k "cd backend && python worker.py"

:: ── Open browser ──────────────────────────────────────────────────────────
timeout /t 5 /nobreak >nul
start http://localhost:5173

echo All services started in separate windows.
echo Close those windows (or press Ctrl+C in each) to stop the app.
echo.
