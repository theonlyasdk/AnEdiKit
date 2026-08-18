@echo off
setlocal
echo Requesting administrative privileges...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process python -ArgumentList '\"%~dp0install_tauri_dependencies.py\"' -Verb RunAs"
endlocal
