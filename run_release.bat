@echo off
rem Launch the locally-built release version of the app (GUI, detached).
rem Build it first with: build_release.bat --no-bundle
node tools\scripts\run_release.js %*
