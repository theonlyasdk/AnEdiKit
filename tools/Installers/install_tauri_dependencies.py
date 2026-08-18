"""
Tauri & Dependencies Installer for Windows
Automates the installation of:
  1. Visual Studio C++ Build Tools (MSVC Compiler & Windows SDK)
  2. Microsoft Edge WebView2 Runtime
  3. Rust Toolchain (rustup, rustc, cargo)
  4. Tauri CLI (Cargo Tauri & npm CLI verification)
Includes colored terminal output, admin privileges check/elevation, and PATH configuration.
"""

import os
import sys
import argparse
import subprocess
import urllib.request
import tempfile
import time
import winreg
import ctypes
from pathlib import Path

# Force UTF-8 output encoding for Windows terminals
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# ANSI Color codes
class Color:
    RESET = "\033[0m"
    BOLD = "\033[1m"
    DIM = "\033[2m"
    UNDERLINE = "\033[4m"
    
    # Foreground colors
    BLACK = "\033[30m"
    RED = "\033[31m"
    GREEN = "\033[32m"
    YELLOW = "\033[33m"
    BLUE = "\033[34m"
    MAGENTA = "\033[35m"
    CYAN = "\033[36m"
    WHITE = "\033[37m"
    
    # Bright foreground colors
    BRIGHT_RED = "\033[91m"
    BRIGHT_GREEN = "\033[92m"
    BRIGHT_YELLOW = "\033[93m"
    BRIGHT_BLUE = "\033[94m"
    BRIGHT_MAGENTA = "\033[95m"
    BRIGHT_CYAN = "\033[96m"
    BRIGHT_WHITE = "\033[97m"


def enable_windows_ansi_colors():
    """Enable Virtual Terminal processing in Windows console for ANSI colors."""
    try:
        kernel32 = ctypes.windll.kernel32
        h_stdout = kernel32.GetStdHandle(-11)  # STD_OUTPUT_HANDLE = -11
        mode = ctypes.c_ulong()
        if kernel32.GetConsoleMode(h_stdout, ctypes.byref(mode)):
            # ENABLE_VIRTUAL_TERMINAL_PROCESSING = 0x0004
            kernel32.SetConsoleMode(h_stdout, mode.value | 0x0004)
    except Exception:
        pass


def is_admin() -> bool:
    """Check if the current process is running with Administrator privileges."""
    try:
        return ctypes.windll.shell32.IsUserAnAdmin() != 0
    except Exception:
        return False


def request_admin_elevation() -> bool:
    """Re-launch the script with Administrator privileges using runas."""
    print(f"\n{Color.BRIGHT_YELLOW}[*] Requesting Administrator elevation (UAC prompt)...{Color.RESET}")
    params = f'"{os.path.abspath(__file__)}"'
    if len(sys.argv) > 1:
        params += " " + " ".join(f'"{arg}"' for arg in sys.argv[1:] if arg != "--elevated")
    params += " --elevated"
    
    python_exe = sys.executable
    ret = ctypes.windll.shell32.ShellExecuteW(
        None,
        "runas",
        python_exe,
        params,
        None,
        1  # SW_SHOWNORMAL
    )
    if ret > 32:
        print(f"{Color.BRIGHT_GREEN}[+] Elevated window opened successfully.{Color.RESET}")
        return True
    else:
        print(f"{Color.BRIGHT_YELLOW}[!] Elevation cancelled or not available in non-interactive mode. (Code: {ret}){Color.RESET}")
        return False


def log_header(title: str):
    width = 72
    line = "=" * width
    print(f"\n{Color.BRIGHT_CYAN}{line}")
    print(f" {Color.BOLD}{Color.BRIGHT_WHITE}{title.center(width - 2)}{Color.RESET}{Color.BRIGHT_CYAN}")
    print(f"{line}{Color.RESET}\n")


def log_step(step_num: int, total_steps: int, message: str):
    print(f"{Color.BRIGHT_MAGENTA}[Step {step_num}/{total_steps}]{Color.RESET} {Color.BOLD}{Color.BRIGHT_WHITE}{message}{Color.RESET}")


def log_info(message: str):
    print(f"  {Color.BRIGHT_BLUE}[INFO]{Color.RESET} {message}")


def log_success(message: str):
    print(f"  {Color.BRIGHT_GREEN}[SUCCESS]{Color.RESET} {message}")


def log_warning(message: str):
    print(f"  {Color.BRIGHT_YELLOW}[WARNING]{Color.RESET} {message}")


def log_error(message: str):
    print(f"  {Color.BRIGHT_RED}[ERROR]{Color.RESET} {message}")


def run_command_live(cmd: list[str] | str, desc: str = "", shell: bool = False, env: dict = None) -> tuple[int, str]:
    """Runs a command and streams output in real-time with color indentation."""
    if desc:
        log_info(f"Running: {Color.DIM}{desc}{Color.RESET}")
    
    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            shell=shell,
            bufsize=1,
            env=env or os.environ
        )
        
        output_lines = []
        for line in iter(proc.stdout.readline, ''):
            if not line:
                break
            stripped = line.rstrip()
            output_lines.append(stripped)
            if stripped:
                print(f"    {Color.DIM}|{Color.RESET} {stripped}")
                
        proc.stdout.close()
        proc.wait()
        return proc.returncode, "\n".join(output_lines)
    except Exception as e:
        log_error(f"Failed to execute command: {e}")
        return 1, str(e)


def download_file_with_progress(url: str, dest_path: str, label: str = "Downloading"):
    """Downloads a file and displays a colored progress bar."""
    log_info(f"{label}: {Color.UNDERLINE}{url}{Color.RESET}")
    
    def report_progress(block_num, block_size, total_size):
        downloaded = block_num * block_size
        if total_size > 0:
            percent = min(100.0, downloaded * 100.0 / total_size)
            mb_down = downloaded / (1024 * 1024)
            mb_total = total_size / (1024 * 1024)
            bar_len = 30
            filled_len = int(bar_len * percent / 100)
            bar = '#' * filled_len + '-' * (bar_len - filled_len)
            print(f"\r    {Color.BRIGHT_CYAN}[{bar}]{Color.RESET} {percent:5.1f}% ({mb_down:5.1f}/{mb_total:5.1f} MB)", end='', flush=True)
        else:
            mb_down = downloaded / (1024 * 1024)
            print(f"\r    {Color.BRIGHT_CYAN}[Downloading...]{Color.RESET} {mb_down:5.1f} MB", end='', flush=True)
            
    urllib.request.urlretrieve(url, dest_path, reporthook=report_progress)
    print()  # newline after progress bar


def refresh_environment_paths():
    """Reloads system and user PATH variables into the current Python process."""
    paths = []
    # User PATH
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Environment", 0, winreg.KEY_READ) as key:
            user_path, _ = winreg.QueryValueEx(key, "Path")
            paths.extend(user_path.split(";"))
    except Exception:
        pass

    # System PATH
    try:
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment", 0, winreg.KEY_READ) as key:
            sys_path, _ = winreg.QueryValueEx(key, "Path")
            paths.extend(sys_path.split(";"))
    except Exception:
        pass

    # Add default cargo bin
    cargo_bin = os.path.expandvars(r"%USERPROFILE%\.cargo\bin")
    if cargo_bin not in paths and os.path.exists(cargo_bin):
        paths.insert(0, cargo_bin)

    existing = os.environ.get("PATH", "").split(";")
    for p in paths:
        p_clean = p.strip()
        if p_clean and p_clean not in existing:
            existing.insert(0, p_clean)
            
    os.environ["PATH"] = ";".join(existing)


def ensure_cargo_in_user_path():
    """Ensures %USERPROFILE%\\.cargo\\bin is registered in the HKCU\\Environment PATH."""
    cargo_bin = os.path.expandvars(r"%USERPROFILE%\.cargo\bin")
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Environment", 0, winreg.KEY_ALL_ACCESS) as key:
            try:
                current_path, path_type = winreg.QueryValueEx(key, "Path")
            except FileNotFoundError:
                current_path, path_type = "", winreg.REG_EXPAND_SZ

            path_entries = [p.strip() for p in current_path.split(";") if p.strip()]
            if cargo_bin.lower() not in [p.lower() for p in path_entries]:
                path_entries.append(cargo_bin)
                new_path = ";".join(path_entries)
                winreg.SetValueEx(key, "Path", 0, path_type, new_path)
                log_success(f"Added {Color.BRIGHT_WHITE}{cargo_bin}{Color.RESET} to User PATH registry.")
            else:
                log_info(f"Cargo bin already present in User PATH registry.")
    except Exception as e:
        log_warning(f"Could not update registry PATH: {e}")


# =========================================================================
# Step Check & Install Functions
# =========================================================================

def check_vs_build_tools() -> bool:
    """Checks if Visual Studio C++ Build Tools / Compiler are installed."""
    vswhere_path = os.path.expandvars(r"%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe")
    if os.path.exists(vswhere_path):
        res = subprocess.run(
            [vswhere_path, "-latest", "-requires", "Microsoft.VisualStudio.Component.VC.Tools.x86.x64", "-property", "installationPath"],
            capture_output=True, text=True
        )
        if res.returncode == 0 and res.stdout.strip():
            log_info(f"Detected Visual Studio C++ Tools at: {Color.DIM}{res.stdout.strip()}{Color.RESET}")
            return True
            
    # Check default installation directory
    default_vs = [
        r"C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC",
        r"C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Tools\MSVC",
        r"C:\Program Files\Microsoft Visual Studio\2022\Professional\VC\Tools\MSVC",
        r"C:\Program Files\Microsoft Visual Studio\2022\Enterprise\VC\Tools\MSVC"
    ]
    for p in default_vs:
        if os.path.exists(p) and any(os.scandir(p)):
            log_info(f"Detected Visual Studio MSVC at: {Color.DIM}{p}{Color.RESET}")
            return True
            
    return False


def install_vs_build_tools() -> bool:
    """Installs Microsoft Visual Studio C++ Build Tools."""
    log_info("Installing Visual Studio 2022 C++ Build Tools...")
    
    # Try winget first if available
    winget_check = subprocess.run(["winget", "--version"], capture_output=True, text=True, shell=True)
    if winget_check.returncode == 0:
        log_info("Attempting install via Winget...")
        cmd = [
            "winget", "install", "--id", "Microsoft.VisualStudio.2022.BuildTools",
            "-e", "--silent", "--accept-package-agreements", "--accept-source-agreements",
            "--override", "--passive --wait --nocache --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
        ]
        code, _ = run_command_live(cmd, "winget install VS Build Tools", shell=True)
        if code == 0 or check_vs_build_tools():
            return True
    
    # Fallback to direct bootstrapper download
    temp_dir = tempfile.gettempdir()
    installer_path = os.path.join(temp_dir, "vs_BuildTools.exe")
    url = "https://aka.ms/vs/17/release/vs_BuildTools.exe"
    
    try:
        download_file_with_progress(url, installer_path, "Downloading Visual Studio Build Tools Bootstrapper")
        cmd = [
            installer_path,
            "--quiet", "--wait", "--norestart", "--nocache",
            "--add", "Microsoft.VisualStudio.Workload.VCTools",
            "--includeRecommended"
        ]
        code, _ = run_command_live(cmd, "Executing VS Build Tools installer")
        return code == 0 or check_vs_build_tools()
    except Exception as e:
        log_error(f"VS Build Tools installation error: {e}")
        return False


def check_webview2() -> bool:
    """Checks if Microsoft Edge WebView2 runtime is installed."""
    reg_keys = [
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"),
        (winreg.HKEY_CURRENT_USER, r"Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"),
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}")
    ]
    for root, key_path in reg_keys:
        try:
            with winreg.OpenKey(root, key_path, 0, winreg.KEY_READ) as key:
                val, _ = winreg.QueryValueEx(key, "pv")
                if val:
                    log_info(f"Detected Microsoft Edge WebView2 Runtime version: {Color.DIM}{val}{Color.RESET}")
                    return True
        except Exception:
            continue
            
    # Check default program files path
    wv2_path = os.path.expandvars(r"%ProgramFiles(x86)%\Microsoft\EdgeWebView\Application")
    if os.path.exists(wv2_path) and any(os.scandir(wv2_path)):
        log_info("Detected WebView2 in Program Files.")
        return True

    return False


def install_webview2() -> bool:
    """Installs Microsoft Edge WebView2 Runtime."""
    log_info("Installing Microsoft Edge WebView2 Runtime...")
    temp_dir = tempfile.gettempdir()
    installer_path = os.path.join(temp_dir, "MicrosoftEdgeWebview2Setup.exe")
    url = "https://go.microsoft.com/fwlink/p/?LinkId=2124703"
    
    try:
        download_file_with_progress(url, installer_path, "Downloading WebView2 Evergreen Bootstrapper")
        cmd = [installer_path, "/silent", "/install"]
        code, _ = run_command_live(cmd, "Installing WebView2 Runtime")
        return code == 0 or check_webview2()
    except Exception as e:
        log_error(f"WebView2 installation error: {e}")
        return False


def check_rust() -> tuple[bool, str]:
    """Checks if rustc is installed and working."""
    refresh_environment_paths()
    try:
        res = subprocess.run(["rustc", "--version"], capture_output=True, text=True, shell=True)
        if res.returncode == 0:
            return True, res.stdout.strip()
    except Exception:
        pass
    
    # Check directly in default cargo path
    cargo_bin = Path(os.path.expandvars(r"%USERPROFILE%\.cargo\bin\rustc.exe"))
    if cargo_bin.exists():
        try:
            res = subprocess.run([str(cargo_bin), "--version"], capture_output=True, text=True)
            if res.returncode == 0:
                return True, res.stdout.strip()
        except Exception:
            pass
            
    return False, ""


def install_rust() -> bool:
    """Installs Rust using rustup-init."""
    log_info("Installing Rust Toolchain via rustup-init...")
    temp_dir = tempfile.gettempdir()
    installer_path = os.path.join(temp_dir, "rustup-init.exe")
    url = "https://win.rustup.rs/x86_64"
    
    try:
        download_file_with_progress(url, installer_path, "Downloading rustup-init (x86_64-pc-windows-msvc)")
        cmd = [installer_path, "-y", "--default-toolchain", "stable", "--profile", "default"]
        code, _ = run_command_live(cmd, "Running rustup-init.exe -y")
        
        ensure_cargo_in_user_path()
        refresh_environment_paths()
        
        is_installed, ver = check_rust()
        if is_installed:
            log_success(f"Rust installed successfully: {ver}")
            return True
        return code == 0
    except Exception as e:
        log_error(f"Rust installation error: {e}")
        return False


def check_cargo_tauri() -> bool:
    """Checks if cargo-tauri CLI is installed."""
    refresh_environment_paths()
    try:
        res = subprocess.run(["cargo", "tauri", "--version"], capture_output=True, text=True, shell=True)
        if res.returncode == 0:
            log_info(f"Cargo Tauri version: {Color.DIM}{res.stdout.strip()}{Color.RESET}")
            return True
    except Exception:
        pass
    return False


def install_cargo_tauri() -> bool:
    """Installs cargo-tauri CLI tool."""
    log_info("Installing cargo-tauri CLI via cargo...")
    refresh_environment_paths()
    cmd = ["cargo", "install", "tauri-cli", "--locked"]
    code, _ = run_command_live(cmd, "cargo install tauri-cli --locked", shell=True)
    return code == 0 or check_cargo_tauri()


# =========================================================================
# Main Execution Flow
# =========================================================================

def main():
    parser = argparse.ArgumentParser(description="AnEdiKit Tauri Dependencies Installer")
    parser.add_argument("--elevated", action="store_true", help="Flag indicating elevated process")
    parser.add_argument("--no-elevation", action="store_true", help="Do not attempt auto-elevation")
    args = parser.parse_args()

    enable_windows_ansi_colors()
    log_header("AnEdiKit - Tauri & Dependencies Installer (Windows)")
    
    # Check Admin privileges
    has_admin = is_admin()
    if has_admin:
        log_success(f"Running with {Color.BRIGHT_GREEN}Administrator privileges{Color.RESET}.\n")
    else:
        log_warning("Process is NOT running as Administrator.")
        if not args.no_elevation and not args.elevated:
            elevated = request_admin_elevation()
            if elevated:
                sys.exit(0)
            else:
                log_info("Continuing in non-admin mode. User components (Rust, WebView2, Tauri) will be installed.")
        else:
            log_info("Continuing in current privileges mode.")

    TOTAL_STEPS = 5
    summary = {}
    
    # STEP 1: Microsoft C++ Build Tools
    log_step(1, TOTAL_STEPS, "Visual Studio C++ Build Tools (MSVC)")
    if check_vs_build_tools():
        log_success("Visual Studio C++ Build Tools are already installed.")
        summary["C++ Build Tools"] = "Installed (Pre-existing)"
    else:
        if has_admin:
            log_warning("C++ Build Tools not detected. Commencing installation...")
            if install_vs_build_tools():
                log_success("Visual Studio C++ Build Tools installed successfully.")
                summary["C++ Build Tools"] = "Installed Successfully"
            else:
                log_error("Visual Studio C++ Build Tools installation failed or needs reboot.")
                summary["C++ Build Tools"] = "Failed / Pending Setup"
        else:
            log_warning("C++ Build Tools require Administrator privileges to install.")
            log_info("Please run this script from an elevated Administrator PowerShell prompt to install MSVC tools.")
            summary["C++ Build Tools"] = "Requires Admin Privileges"
            
    print()

    # STEP 2: Microsoft Edge WebView2 Runtime
    log_step(2, TOTAL_STEPS, "Microsoft Edge WebView2 Runtime")
    if check_webview2():
        log_success("Microsoft Edge WebView2 Runtime is already installed.")
        summary["WebView2 Runtime"] = "Installed (Pre-existing)"
    else:
        log_warning("WebView2 Runtime not found. Installing...")
        if install_webview2():
            log_success("WebView2 Runtime installed successfully.")
            summary["WebView2 Runtime"] = "Installed Successfully"
        else:
            log_error("WebView2 Runtime installation failed.")
            summary["WebView2 Runtime"] = "Failed"
            
    print()

    # STEP 3: Rust & Cargo Toolchain
    log_step(3, TOTAL_STEPS, "Rust & Cargo Toolchain (rustup)")
    rust_ok, rust_ver = check_rust()
    if rust_ok:
        log_success(f"Rust is already installed: {Color.BRIGHT_WHITE}{rust_ver}{Color.RESET}")
        summary["Rust Toolchain"] = f"Installed ({rust_ver})"
    else:
        log_warning("Rust is not installed. Commencing rustup installation...")
        if install_rust():
            _, rust_ver = check_rust()
            summary["Rust Toolchain"] = f"Installed Successfully ({rust_ver})"
        else:
            log_error("Rust installation failed.")
            summary["Rust Toolchain"] = "Failed"
            
    print()

    # STEP 4: Tauri CLI (Cargo Tauri)
    log_step(4, TOTAL_STEPS, "Tauri CLI (cargo-tauri)")
    if check_cargo_tauri():
        log_success("cargo-tauri is already installed and available.")
        summary["Tauri CLI"] = "Installed (Pre-existing)"
    else:
        log_info("Installing cargo-tauri CLI...")
        if install_cargo_tauri():
            log_success("cargo-tauri installed successfully.")
            summary["Tauri CLI"] = "Installed Successfully"
        else:
            log_warning("cargo-tauri installation skipped or deferred to npm @tauri-apps/cli.")
            summary["Tauri CLI"] = "Using npm @tauri-apps/cli in project"

    print()

    # STEP 5: Verification & Summary
    log_step(5, TOTAL_STEPS, "Verification & Environment Finalization")
    ensure_cargo_in_user_path()
    refresh_environment_paths()
    
    log_info(f"Target Project: {Color.BRIGHT_WHITE}AnEdiKit{Color.RESET}")
    node_ver = os.popen('node -v').read().strip()
    npm_ver = os.popen('npm -v').read().strip()
    log_info(f"Node.js: {Color.BRIGHT_WHITE}{node_ver}{Color.RESET}")
    log_info(f"npm: {Color.BRIGHT_WHITE}{npm_ver}{Color.RESET}")
    
    rust_ok, rust_ver = check_rust()
    if rust_ok:
        log_info(f"Rustc: {Color.BRIGHT_WHITE}{rust_ver}{Color.RESET}")
    
    log_header("Installation Summary")
    for component, status in summary.items():
        color = Color.BRIGHT_GREEN if "Installed" in status or "Pre-existing" in status else Color.BRIGHT_YELLOW if "Requires" in status or "Using" in status else Color.BRIGHT_RED
        print(f"  * {Color.BOLD}{component:<24}{Color.RESET} : {color}{status}{Color.RESET}")
        
    print(f"\n{Color.BRIGHT_GREEN}{Color.BOLD}[+] All setup checks completed!{Color.RESET}")
    print(f"{Color.DIM}To start developing AnEdiKit, open a fresh terminal and run:{Color.RESET}")
    print(f"  {Color.BRIGHT_CYAN}cd AnEdiKit{Color.RESET}")
    print(f"  {Color.BRIGHT_CYAN}npm run tauri dev{Color.RESET}\n")


if __name__ == "__main__":
    main()
