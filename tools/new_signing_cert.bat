@echo off
rem AnEdiKit self-signed code-signing certificate generator.
rem   No arguments -> interactive prompts. See --help for flags.
node Scripts\new_signing_cert.js %*
