#Requires -Version 5.1
<#
.SYNOPSIS
Removes disposable AnEdiKit build output and caches after a run.
.EXAMPLE
powershell -NoProfile -File .\tools\clean_caches.ps1 -WhatIf
.EXAMPLE
powershell -NoProfile -File .\tools\clean_caches.ps1 -CargoCache -NpmCache
#>
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
param(
    # Also clear downloaded Cargo dependencies shared by all Rust projects.
    [switch]$CargoCache,
    # Also clear npm downloads, logs, and npx packages shared by all projects.
    [switch]$NpmCache,
    # Use console output only (also implied by -WhatIf).
    [switch]$NoGui
)

$ErrorActionPreference = 'Stop'
$script:cleanupWindow = $null
$script:cleanupStatus = $null
$script:cleanupProgress = $null
function Update-CleanupWindow {
    param([string]$Status, [int]$Completed = -1)
    if ($null -eq $script:cleanupWindow) { return }
    if ($Status) { $script:cleanupStatus.Text = $Status }
    if ($Completed -ge 0) { $script:cleanupProgress.Value = $Completed }
    [System.Windows.Forms.Application]::DoEvents()
}
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'src-tauri/Cargo.toml') -PathType Leaf)) {
    throw 'Place this script in the AnEdiKit tools folder before running it.'
}

# Every deletion must be a strict child of its explicitly selected cache root.
# Reject links at every level so recursive deletion cannot cross into other data.
function Get-CheckedCache {
    param([string]$Root, [string]$RelativePath)
    $basePath = [IO.Path]::GetFullPath($Root).TrimEnd('\', '/')
    $targetPath = [IO.Path]::GetFullPath((Join-Path $basePath $RelativePath))
    if (-not $targetPath.StartsWith($basePath + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Cleanup path is outside its allowed root: $targetPath"
    }

    # Check ancestors too (for example a linked node_modules or Cargo home).
    $ancestor = $targetPath
    while ($ancestor) {
        if (Test-Path -LiteralPath $ancestor) {
            $item = Get-Item -LiteralPath $ancestor -Force
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
                throw "Refusing to clean through a symbolic link or junction: $ancestor"
            }
        }
        $ancestor = [IO.Path]::GetDirectoryName($ancestor)
    }
    if (-not (Test-Path -LiteralPath $targetPath)) { return }
    $target = Get-Item -LiteralPath $targetPath -Force
    if (-not $target.PSIsContainer) { throw "Expected a cache directory: $targetPath" }

    [long]$bytes = 0
    $pending = New-Object 'System.Collections.Generic.Stack[string]'
    $pending.Push($targetPath)
    while ($pending.Count -gt 0) {
        Update-CleanupWindow
        foreach ($entry in Get-ChildItem -LiteralPath $pending.Pop() -Force) {
            if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) {
                throw "Refusing to clean a directory containing a symbolic link or junction: $($entry.FullName)"
            }
            if ($entry.PSIsContainer) { $pending.Push($entry.FullName) }
            else { $bytes += $entry.Length }
        }
    }
    [pscustomobject]@{ Path = $targetPath; Bytes = $bytes }
}

$requests = @()
foreach ($relative in @('src-tauri/target', 'target', 'dist', 'dist-ssr', 'node_modules/.cache', '.pytest_cache', '.ruff_cache', '__pycache__')) {
    $requests += @{ Root = $projectRoot; RelativePath = $relative }
}
if ($CargoCache) {
    $cargoHome = $env:CARGO_HOME
    if (-not $cargoHome) { $cargoHome = Join-Path $env:USERPROFILE '.cargo' }
    foreach ($relative in @('registry/cache', 'registry/src', 'registry/index', 'git/db', 'git/checkouts')) {
        $requests += @{ Root = $cargoHome; RelativePath = $relative }
    }
}
if ($NpmCache) {
    $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $npm) { throw 'npm.cmd is required to locate the shared npm cache.' }
    $npmOutput = @(& $npm.Source config get cache)
    if ($LASTEXITCODE -ne 0 -or $npmOutput.Count -ne 1 -or -not [IO.Path]::IsPathRooted($npmOutput[0])) {
        throw 'Could not determine an absolute npm cache path.'
    }
    foreach ($relative in @('_cacache', '_logs', '_npx')) {
        $requests += @{ Root = $npmOutput[0]; RelativePath = $relative }
    }
}

Write-Host 'Close AnEdiKit and stop builds/dev servers before cleanup. Future builds will recreate these files.'
if (-not $NoGui -and -not $WhatIfPreference) {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    [System.Windows.Forms.Application]::EnableVisualStyles()
    $script:cleanupWindow = New-Object System.Windows.Forms.Form
    $script:cleanupWindow.Text = 'AnEdiKit cache cleanup'
    $script:cleanupWindow.ClientSize = New-Object System.Drawing.Size(520, 125)
    $script:cleanupWindow.StartPosition = 'CenterScreen'
    $script:cleanupWindow.FormBorderStyle = 'FixedDialog'
    $script:cleanupWindow.MaximizeBox = $false
    $script:cleanupWindow.MinimizeBox = $false
    $script:cleanupWindow.ControlBox = $false
    $script:cleanupStatus = New-Object System.Windows.Forms.Label
    $script:cleanupStatus.Location = New-Object System.Drawing.Point(18, 18)
    $script:cleanupStatus.Size = New-Object System.Drawing.Size(484, 44)
    $script:cleanupStatus.AutoEllipsis = $true
    $script:cleanupProgress = New-Object System.Windows.Forms.ProgressBar
    $script:cleanupProgress.Location = New-Object System.Drawing.Point(18, 78)
    $script:cleanupProgress.Size = New-Object System.Drawing.Size(484, 24)
    $script:cleanupProgress.Maximum = $requests.Count
    $script:cleanupWindow.Controls.AddRange(@($script:cleanupStatus, $script:cleanupProgress))
    $script:cleanupWindow.Show()
    Update-CleanupWindow -Status 'Starting cleanup...'
}
[long]$removedBytes = 0
$failed = $false
$completed = 0
try {
foreach ($request in $requests) {
    try {
        Update-CleanupWindow -Status "Checking $($request.RelativePath)..."
        $cache = Get-CheckedCache @request
        if ($null -eq $cache) { continue }
        $size = '{0:N2} GiB' -f ($cache.Bytes / 1GB)
        if ($PSCmdlet.ShouldProcess($cache.Path, "Delete cache/build output ($size)")) {
            Update-CleanupWindow -Status "Cleaning $($request.RelativePath) ($size)..."
            if ($null -eq $script:cleanupWindow) {
                Remove-Item -LiteralPath $cache.Path -Recurse -Force
            }
            else {
                # Delete off the UI thread so large Rust caches do not freeze the window.
                $worker = [PowerShell]::Create()
                try {
                    [void]$worker.AddScript('param($cachePath) Remove-Item -LiteralPath $cachePath -Recurse -Force -ErrorAction Stop').AddArgument($cache.Path)
                    $operation = $worker.BeginInvoke()
                    while (-not $operation.IsCompleted) {
                        Update-CleanupWindow
                        Start-Sleep -Milliseconds 50
                    }
                    $worker.EndInvoke($operation) | Out-Null
                    if ($worker.HadErrors) { throw ($worker.Streams.Error | Out-String) }
                }
                finally { $worker.Dispose() }
            }
            $removedBytes += $cache.Bytes
            Write-Host "Removed $($cache.Path) ($size)"
        }
    }
    catch {
        $failed = $true
        Write-Warning $_.Exception.Message
    }
    finally {
        $completed++
        Update-CleanupWindow -Completed $completed
    }
}
$summary = 'Removed {0:N2} GiB of files (logical size).' -f ($removedBytes / 1GB)
Write-Host $summary
if ($null -ne $script:cleanupWindow) {
    $message = "Cleanup complete.`n`n$summary"
    $icon = [System.Windows.Forms.MessageBoxIcon]::Information
    if ($failed) {
        $message = "Cleanup finished with errors.`n`n$summary`n`nSome caches could not be cleaned. See console warnings for details."
        $icon = [System.Windows.Forms.MessageBoxIcon]::Warning
    }
    Update-CleanupWindow -Status 'Finished.'
    [void][System.Windows.Forms.MessageBox]::Show($script:cleanupWindow, $message, 'AnEdiKit cache cleanup', [System.Windows.Forms.MessageBoxButtons]::OK, $icon)
}
}
finally {
    if ($null -ne $script:cleanupWindow) {
        $script:cleanupWindow.Dispose()
        $script:cleanupWindow = $null
    }
}
if ($failed) { throw 'Some caches could not be cleaned. Close programs using them and review the warnings.' }
