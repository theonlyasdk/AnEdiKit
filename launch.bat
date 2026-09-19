@echo off
rem AnEdiKit launcher: dev, release run, or release build.
rem   [1] -> npm run tauri dev (debug)
rem   [2] -> launch the release app (build it first with option 3)
rem   [3] -> build the release (interactive artifact picker)
rem   [0] -> exit
setlocal

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

if "%choice%"=="0" goto done
if "%choice%"=="1" goto dev
if "%choice%"=="2" goto run_release
if "%choice%"=="3" goto build_release
if "%choice%"=="0" goto done
goto menu

:dev
echo.
echo Starting local dev build...
npm run tauri dev
goto menu

:run_release
echo.
node tools\Scripts\run_release.js
goto menu

:build_release
echo.
node tools\Scripts\build_release.js --interactive
goto menu

:done
echo.
echo Goodbye.
exit /b 0