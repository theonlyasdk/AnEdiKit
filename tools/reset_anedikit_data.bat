@echo off
rem AnEdiKit data reset - removes storage/config folders so the next launch
rem feels like a fresh install (settings, queues, kits, caches, AI models,
rem tool binaries, and WebView localStorage).
rem
rem Usage: reset_anedikit_data.bat [--keep-tools] [--yes]
rem   --keep-tools  Preserve downloaded tool binaries (ffmpeg/yt-dlp/deno)
rem                 so they are not re-downloaded on next launch.
rem   --yes         Skip the confirmation prompt (for scripts).
setlocal EnableDelayedExpansion

set KEEP_TOOLS=0
set SKIP_CONFIRM=0
for %%A in (%*) do (
  if /I "%%~A"=="--keep-tools" set KEEP_TOOLS=1
  if /I "%%~A"=="-keep-tools" set KEEP_TOOLS=1
  if /I "%%~A"=="--yes" set SKIP_CONFIRM=1
  if /I "%%~A"=="-y" set SKIP_CONFIRM=1
)

echo ============================================================
echo  AnEdiKit data reset
echo ============================================================
echo  This deletes settings, queues, kits, caches, AI models,
echo  downloaded tools and WebView storage (localStorage).
if "%KEEP_TOOLS%"=="1" (
  echo  Tool binaries ^(ffmpeg/yt-dlp/deno^) will be KEPT.
) else (
  echo  Tool binaries WILL be re-downloaded on next launch.
)
echo.

if "%SKIP_CONFIRM%"=="0" (
  choice /C YN /N /M "Delete ALL AnEdiKit data? [Y/N]: "
  if errorlevel 2 (
    echo Cancelled. Nothing was deleted.
    exit /b 0
  )
  echo.
)

rem Stop a running instance first (WebView storage is locked while open).
taskkill /F /IM anedikit.exe >nul 2>&1
timeout /t 2 /nobreak >nul 2>&1

set REMOVED=0
set KEPT=0

rem --- App data: AI models, thumbnail caches ---
if exist "%LOCALAPPDATA%\ASDK\AnEdiKit" (
  echo [del] %LOCALAPPDATA%\ASDK\AnEdiKit
  rd /s /q "%LOCALAPPDATA%\ASDK\AnEdiKit"
  set /a REMOVED+=1
)

rem --- Legacy settings folders ---
if exist "%LOCALAPPDATA%\ASDK\ffmpeg-tools" (
  echo [del] %LOCALAPPDATA%\ASDK\ffmpeg-tools
  rd /s /q "%LOCALAPPDATA%\ASDK\ffmpeg-tools"
  set /a REMOVED+=1
)
if exist "%LOCALAPPDATA%\ASDK\yt-dlp-frontend" (
  echo [del] %LOCALAPPDATA%\ASDK\yt-dlp-frontend
  rd /s /q "%LOCALAPPDATA%\ASDK\yt-dlp-frontend"
  set /a REMOVED+=1
)

rem --- Downloaded tool binaries ---
if "%KEEP_TOOLS%"=="1" (
  if exist "%LOCALAPPDATA%\ASDK\Shared\bin" (
    echo [keep] %LOCALAPPDATA%\ASDK\Shared\bin
    set /a KEPT+=1
  )
) else (
  if exist "%LOCALAPPDATA%\ASDK\Shared\bin" (
    echo [del] %LOCALAPPDATA%\ASDK\Shared\bin
    rd /s /q "%LOCALAPPDATA%\ASDK\Shared\bin"
    set /a REMOVED+=1
  )
)

rem --- WebView storage: settings, queues, kits, localStorage ---
if exist "%LOCALAPPDATA%\com.user.anedikit" (
  echo [del] %LOCALAPPDATA%\com.user.anedikit  ^(WebView data^)
  rd /s /q "%LOCALAPPDATA%\com.user.anedikit"
  set /a REMOVED+=1
)
if exist "%APPDATA%\com.user.anedikit" (
  echo [del] %APPDATA%\com.user.anedikit  ^(roaming data^)
  rd /s /q "%APPDATA%\com.user.anedikit"
  set /a REMOVED+=1
)

rem --- Temp leftovers: concat lists, screenshot staging ---
for %%F in ("%TEMP%\anedikit_concat_*.txt") do (
  if exist "%%F" (
    del /f /q "%%F" >nul 2>&1
    set /a REMOVED+=1
  )
)
for /d %%D in ("%TEMP%\anedikit-shots-*") do (
  if exist "%%D" (
    echo [del] %%D
    rd /s /q "%%D"
    set /a REMOVED+=1
  )
)

echo.
echo ============================================================
echo  Done. Removed %REMOVED% item^(s^), kept %KEPT% item^(s^).
echo  Next launch will behave like a fresh install.
echo ============================================================
endlocal
exit /b 0
