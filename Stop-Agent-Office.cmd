@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Stop-AgentOffice.ps1" %*
if errorlevel 1 (
  echo.
  echo Stop failed. Review the error above.
  pause
  exit /b 1
)
