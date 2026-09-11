@echo off
cd /d "%~dp0"

if not exist package-lock.json (
  echo Keine package-lock.json gefunden.
  echo Bitte zuerst RESET-UND-INSTALLIEREN.bat ausfuehren.
  pause
  exit /b 1
)

if exist node_modules rmdir /s /q node_modules
call npm ci
if errorlevel 1 (
  echo npm ci ist fehlgeschlagen.
  pause
  exit /b 1
)

echo Exakte Lockfile-Versionen wurden installiert.
pause
