@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Maintain-AgentOffice.ps1" -Action Uninstall %*
if errorlevel 1 (
  pause
  exit /b 1
)
pause
