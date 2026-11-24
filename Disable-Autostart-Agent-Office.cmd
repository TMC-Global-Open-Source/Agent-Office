@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Manage-Autostart.ps1" -Action Disable
if errorlevel 1 (
  echo Autostart removal failed. Review the error above.
  pause
  exit /b 1
)
pause
