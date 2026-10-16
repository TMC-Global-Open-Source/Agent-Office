@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Launch-AgentOffice.ps1" -Share %*
if errorlevel 1 (
  echo.
  echo Launch failed. Review the error above.
  pause
  exit /b 1
)
