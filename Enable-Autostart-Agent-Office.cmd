@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Manage-Autostart.ps1" -Action Enable
if errorlevel 1 (
  echo Autostart setup failed. Review the error above.
  pause
  exit /b 1
)
pause
