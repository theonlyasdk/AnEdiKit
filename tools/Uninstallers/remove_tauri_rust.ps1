# ============================================================
# remove_tauri_rust.ps1 - Tauri & Rust Deep Clean Uninstaller
# ============================================================
# This script performs a complete deep clean removal of Rust (rustup, cargo,
# toolchains) and Tauri (CLIs, caches, package dependencies) from Windows.
# ============================================================

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

Write-Host "Starting Tauri & Rust Deep Clean..." -ForegroundColor Cyan
if (-not $isAdmin) {
    Write-Host "[NOTE] Running in non-elevated mode. Machine-wide PATH and registry cleanup may be skipped." -ForegroundColor Yellow
    Write-Host "       To perform a full system-wide purge, run this script as Administrator." -ForegroundColor Yellow
}

# 1. Terminate running processes to unlock files
Write-Host "`n[1/6] Stopping active Tauri, Rust, and Cargo processes..." -ForegroundColor Yellow
$TargetProcesses = @(
    "cargo", "rustc", "rustup", "rust-analyzer", "rls", 
    "cargo-clippy", "cargo-fmt", "cargo-tauri", "tauri",
    "create-tauri-app"
)
$StoppedAny = $false
foreach ($ProcName in $TargetProcesses) {
    $Procs = Get-Process -Name $ProcName -ErrorAction SilentlyContinue
    if ($Procs) {
        Write-Host " -> Stopping active process: $ProcName" -ForegroundColor Red
        $Procs | Stop-Process -Force -ErrorAction SilentlyContinue
        $StoppedAny = $true
    }
}
if (-not $StoppedAny) {
    Write-Host " -> No active Rust or Tauri processes found." -ForegroundColor Gray
}

# 2. Run official and package manager uninstallers (graceful removal)
Write-Host "`n[2/6] Attempting standard uninstall routines..." -ForegroundColor Yellow

# Try official rustup self uninstall
if (Get-Command rustup -ErrorAction SilentlyContinue) {
    try {
        Write-Host " -> Launching 'rustup self uninstall'..." -ForegroundColor Gray
        # -y executes non-interactively
        rustup self uninstall -y *>&1 | Out-Null
        Write-Host " -> Official Rust uninstallation completed." -ForegroundColor Green
    } catch {
        Write-Host " -> Official uninstaller failed. Proceeding with manual cleanup." -ForegroundColor Yellow
    }
}

# Check for Scoop installs
if (Get-Command scoop -ErrorAction SilentlyContinue) {
    Write-Host " -> Checking Scoop packages..." -ForegroundColor Gray
    try { scoop uninstall rustup *>&1 | Out-Null } catch { }
    try { scoop uninstall rust *>&1 | Out-Null } catch { }
    try { scoop uninstall tauri *>&1 | Out-Null } catch { }
}

# Check for Chocolatey installs
if (Get-Command choco -ErrorAction SilentlyContinue) {
    Write-Host " -> Checking Chocolatey packages..." -ForegroundColor Gray
    try { choco uninstall rustup -y *>&1 | Out-Null } catch { }
    try { choco uninstall rust -y *>&1 | Out-Null } catch { }
    try { choco uninstall tauri-cli -y *>&1 | Out-Null } catch { }
}

# Check for WinGet installs
if (Get-Command winget -ErrorAction SilentlyContinue) {
    Write-Host " -> Checking WinGet packages..." -ForegroundColor Gray
    try { winget uninstall "Rust.Rustup" --silent *>&1 | Out-Null } catch { }
    try { winget uninstall "Rust.Rust" --silent *>&1 | Out-Null } catch { }
}

# Search Registry for MSI-based installations
$UninstallKeys = @(
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*"
)
foreach ($KeyPath in $UninstallKeys) {
    Get-ItemProperty $KeyPath -ErrorAction SilentlyContinue | Where-Object { 
        $_.DisplayName -match "^Rustup\b" -or $_.DisplayName -match "^Rust\b"
    } | ForEach-Object {
        $Name = $_.DisplayName
        $UninstallStr = $_.UninstallString
        if ($UninstallStr) {
            Write-Host " -> Found MSI installer: $Name" -ForegroundColor Yellow
            try {
                if ($UninstallStr -like "msiexec*") {
                    $Args = $UninstallStr -replace "msiexec(\.exe)?\s+/I", "/X"
                    $Args = "$Args /quiet /norestart"
                    Start-Process msiexec.exe -ArgumentList $Args -Wait -NoNewWindow
                } else {
                    Invoke-Expression "& $UninstallStr"
                }
                Write-Host " -> Uninstalled $Name via MSI." -ForegroundColor Green
            } catch {
                Write-Host " -> Failed to run uninstall string for $Name." -ForegroundColor Red
            }
        }
    }
}

# 3. Uninstall global Node package manager dependencies for Tauri
Write-Host "`n[3/6] Attempting global package manager uninstalls for Tauri..." -ForegroundColor Yellow
$TauriPackages = "@tauri-apps/cli create-tauri-app"

if (Get-Command npm -ErrorAction SilentlyContinue) {
    Write-Host " -> Trying npm..." -ForegroundColor Gray
    try { npm uninstall -g $TauriPackages *>&1 | Out-Null } catch { }
}
if (Get-Command pnpm -ErrorAction SilentlyContinue) {
    Write-Host " -> Trying pnpm..." -ForegroundColor Gray
    try { pnpm uninstall -g $TauriPackages *>&1 | Out-Null } catch { }
}
if (Get-Command yarn -ErrorAction SilentlyContinue) {
    Write-Host " -> Trying yarn..." -ForegroundColor Gray
    try { yarn global remove $TauriPackages *>&1 | Out-Null } catch { }
}
if (Get-Command bun -ErrorAction SilentlyContinue) {
    Write-Host " -> Trying bun..." -ForegroundColor Gray
    try { bun uninstall -g $TauriPackages *>&1 | Out-Null } catch { }
}

# 4. Search and Destroy Target Directories
Write-Host "`n[4/6] Searching for Rust & Tauri directories and caches..." -ForegroundColor Yellow
$UserProfile = $env:USERPROFILE
$PathsToSearch = [System.Collections.Generic.List[string]]::new()

# Standard paths
$PathsToSearch.Add("$UserProfile\.cargo")
$PathsToSearch.Add("$UserProfile\.rustup")
$PathsToSearch.Add("$UserProfile\.tauri")
$PathsToSearch.Add("$env:LOCALAPPDATA\tauri")
$PathsToSearch.Add("$env:LOCALAPPDATA\Tauri")
$PathsToSearch.Add("$env:APPDATA\tauri")
$PathsToSearch.Add("$env:APPDATA\Tauri")

# Check for custom environment variable directories
if ($env:CARGO_HOME -and (Test-Path $env:CARGO_HOME)) {
    $PathsToSearch.Add($env:CARGO_HOME)
}
if ($env:RUSTUP_HOME -and (Test-Path $env:RUSTUP_HOME)) {
    $PathsToSearch.Add($env:RUSTUP_HOME)
}

$DeletedDirsCount = 0
foreach ($Path in $PathsToSearch) {
    if (Test-Path $Path) {
        Write-Host " -> Found and deleting: $Path" -ForegroundColor Red
        Remove-Item -Path $Path -Recurse -Force -ErrorAction SilentlyContinue
        $DeletedDirsCount++
    }
}
if ($DeletedDirsCount -eq 0) {
    Write-Host " -> No leftover directories found." -ForegroundColor Gray
}

# 5. Clean Environment Variables and system PATH
Write-Host "`n[5/6] Cleaning environment variables and system PATH..." -ForegroundColor Yellow

$PathsToRemove = @(
    "$UserProfile\.cargo\bin",
    "$UserProfile\.cargo",
    "$UserProfile\.rustup"
)

if ($env:CARGO_HOME) { $PathsToRemove += "$env:CARGO_HOME\bin"; $PathsToRemove += $env:CARGO_HOME }
if ($env:RUSTUP_HOME) { $PathsToRemove += $env:RUSTUP_HOME }

function Remove-FromPath {
    param([string]$PathToRemove)
    $PathToRemove = $PathToRemove.TrimEnd('\')
    
    # Clean current session PATH
    if ($env:PATH -like "*$PathToRemove*") {
        $Paths = $env:PATH -split ';' | Where-Object { $_.TrimEnd('\') -ne $PathToRemove -and $_.Trim() -ne "" }
        $env:PATH = $Paths -join ';'
    }
    
    # Clean User PATH
    $UserPath = [Environment]::GetEnvironmentVariable("PATH", "User")
    if ($UserPath -like "*$PathToRemove*") {
        $UserPaths = $UserPath -split ';' | Where-Object { $_.TrimEnd('\') -ne $PathToRemove -and $_.Trim() -ne "" }
        [Environment]::SetEnvironmentVariable("PATH", ($UserPaths -join ';'), "User")
        Write-Host " -> Removed from User PATH: $PathToRemove" -ForegroundColor Red
    }
    
    # Clean Machine PATH
    if ($isAdmin) {
        $MachinePath = [Environment]::GetEnvironmentVariable("PATH", "Machine")
        if ($MachinePath -like "*$PathToRemove*") {
            $MachinePaths = $MachinePath -split ';' | Where-Object { $_.TrimEnd('\') -ne $PathToRemove -and $_.Trim() -ne "" }
            try {
                [Environment]::SetEnvironmentVariable("PATH", ($MachinePaths -join ';'), "Machine")
                Write-Host " -> Removed from Machine PATH: $PathToRemove" -ForegroundColor Red
            } catch {
                Write-Host " -> Failed to modify Machine PATH (requires admin)." -ForegroundColor Gray
            }
        }
    }
}

foreach ($Path in $PathsToRemove) {
    Remove-FromPath -PathToRemove $Path
}

# Delete other related env variables
$EnvVars = @("CARGO_HOME", "RUSTUP_HOME", "RUST_SRC_PATH")
foreach ($Var in $EnvVars) {
    if ([Environment]::GetEnvironmentVariable($Var, "User")) {
        [Environment]::SetEnvironmentVariable($Var, $null, "User")
        Write-Host " -> Cleared User environment variable: $Var" -ForegroundColor Red
    }
    if ($isAdmin -and [Environment]::GetEnvironmentVariable($Var, "Machine")) {
        try {
            [Environment]::SetEnvironmentVariable($Var, $null, "Machine")
            Write-Host " -> Cleared Machine environment variable: $Var" -ForegroundColor Red
        } catch {}
    }
    if (Get-Item "env:$Var" -ErrorAction SilentlyContinue) {
        Remove-Item "env:$Var" -Force -ErrorAction SilentlyContinue
    }
}

# 6. Check and clean Windows Registry for uninstaller registry keys
Write-Host "`n[6/6] Checking Windows Registry for Rustup/Rust leftover keys..." -ForegroundColor Yellow
$RegPaths = @(
    "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Rustup"
)
if ($isAdmin) {
    $RegPaths += "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Rustup"
    $RegPaths += "HKLM:\SOFTWARE\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Rustup"
}

$DeletedRegCount = 0
foreach ($Reg in $RegPaths) {
    if (Test-Path $Reg) {
        Write-Host " -> Found and deleting registry key: $Reg" -ForegroundColor Red
        Remove-Item -Path $Reg -Recurse -Force -ErrorAction SilentlyContinue
        $DeletedRegCount++
    }
}
if ($DeletedRegCount -eq 0) {
    Write-Host " -> No leftover Registry keys found." -ForegroundColor Gray
}

# Final Verification
Write-Host "`nVerifying removal..." -ForegroundColor Yellow
$Remaining = @()
$CheckCommands = @("cargo", "rustc", "rustup", "tauri")
foreach ($Cmd in $CheckCommands) {
    if (Get-Command $Cmd -ErrorAction SilentlyContinue) {
        $Remaining += $Cmd
    }
}

if ($Remaining.Count -eq 0) {
    Write-Host "`nDone! Tauri and Rust have been completely eradicated from your system." -ForegroundColor Green
} else {
    Write-Host "`nCleanup finished, but the following CLI tools are still accessible in this session: $($Remaining -join ', ')" -ForegroundColor Yellow
    Write-Host "Please restart your terminal/system to apply all path changes." -ForegroundColor Yellow
}
