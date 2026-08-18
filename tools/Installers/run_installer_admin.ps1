# Run Tauri dependencies installer as Administrator
$scriptPath = Join-Path $PSScriptRoot "install_tauri_dependencies.py"
$pythonPath = (Get-Command python).Source

Write-Host "[*] Launching Tauri installer with Administrator privileges (RunAs)..." -ForegroundColor Cyan
Start-Process -FilePath $pythonPath -ArgumentList "`"$scriptPath`"" -Verb RunAs
