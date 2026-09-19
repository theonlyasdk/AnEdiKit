@echo off
rem AnEdiKit launcher: dev, release run, or release build.
rem   Usage: launch.bat [0-3]   (no argument = interactive menu)
rem     [0] -> exit
rem     [1] -> local dev (npm run tauri dev)
rem     [2] -> run release (build it first with option 3)
rem     [3] -> build release (interactive artifact picker)
setlocal

rem Option passed on the command line: run it once, then exit.
if not "%~1"=="" (
  set "choice=%~1"
  set "once=1"
  goto run_choice
)

:menu
echo.
echo   AnEdiKit - what do you want to do?
echo   [0] Exit
echo   [1] Local dev
echo   [2] Run release
echo   [3] Build release
echo.
set "choice="
set /p "choice=Choose 0-3: "

:run_choice
if "%choice%"=="0" goto done
if "%choice%"=="1" goto dev
if "%choice%"=="2" goto run_release
if "%choice%"=="3" goto build_release
if defined once (
  echo Unknown option "%~1". Use 0, 1, 2 or 3.
  exit /b 1
)
goto menu

:dev
echo.
echo Starting local dev build...
npm run tauri dev
if defined once exit /b %errorlevel%
goto menu

:run_release
echo.
node tools\Scripts\run_release.js
if defined once exit /b %errorlevel%
goto menu

:build_release
echo.
node tools\Scripts\build_release.js --interactive
if defined once exit /b %errorlevel%
goto menu

:done
echo.
echo Goodbye.
exit /b 0