@echo off
chcp 65001 >nul
REM SurveySui - start local dev PostgreSQL (scoop install)
REM Usage: scripts\start-pg.cmd
REM Idempotent: exits cleanly if server is already running.

setlocal

set "PGROOT=%USERPROFILE%\scoop\apps\postgresql\current"
set "PGBIN=%PGROOT%\bin"
set "PGDATA=%PGROOT%\data"
set "PGLOG=%PGROOT%\pg.log"

if not exist "%PGBIN%\pg_ctl.exe" (
  echo [ERROR] pg_ctl.exe not found at %PGBIN%
  echo Run: scoop install postgresql
  exit /b 1
)

"%PGBIN%\pg_ctl.exe" -D "%PGDATA%" status >nul 2>&1
if %ERRORLEVEL% equ 0 (
  echo [OK] PostgreSQL already running on 127.0.0.1:5432
  exit /b 0
)

echo [..] Starting PostgreSQL...
"%PGBIN%\pg_ctl.exe" -D "%PGDATA%" -l "%PGLOG%" -w start
if %ERRORLEVEL% neq 0 (
  echo [ERROR] start failed - see log: %PGLOG%
  exit /b 1
)

echo [OK] PostgreSQL started on 127.0.0.1:5432
endlocal
