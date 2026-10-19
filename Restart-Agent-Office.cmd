@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Stop-AgentOffice.ps1"
if errorlevel 1 (
  echo.
  echo Restart failed while stopping the office. Review the error above.
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Launch-AgentOffice.ps1" %*
if errorlevel 1 (
  echo.
  echo Restart failed while launching the office. Review the error above.
  pause
  exit /b 1
)
