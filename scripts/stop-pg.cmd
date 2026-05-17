@echo off
chcp 65001 >nul
REM SurveySui - stop local dev PostgreSQL
REM Usage: scripts\stop-pg.cmd

setlocal

set "PGROOT=%USERPROFILE%\scoop\apps\postgresql\current"
set "PGBIN=%PGROOT%\bin"
set "PGDATA=%PGROOT%\data"

"%PGBIN%\pg_ctl.exe" -D "%PGDATA%" status >nul 2>&1
if %ERRORLEVEL% neq 0 (
  echo [OK] PostgreSQL not running
  exit /b 0
)

echo [..] Stopping PostgreSQL...
"%PGBIN%\pg_ctl.exe" -D "%PGDATA%" -m fast stop
endlocal
