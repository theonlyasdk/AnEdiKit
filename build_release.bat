@echo off
rem AnEdiKit release builder.
rem   No arguments -> interactive artifact picker (choose bundles, MSIX signing).
rem   With arguments -> forwarded to tools\scripts\build_release.js (use --help for flags).
if "%~1"=="" (
  node tools\scripts\build_release.js --interactive
) else (
  node tools\scripts\build_release.js %*
)
