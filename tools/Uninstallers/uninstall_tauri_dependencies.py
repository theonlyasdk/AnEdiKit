"""
Tauri & Dependencies Uninstaller for Windows
Automates the safe removal and cleanup of:
  1. Rust Toolchain (rustup, rustc, cargo)
  2. Cargo & Rust directories (~/.cargo, ~/.rustup)
  3. Tauri CLI and cached build artifacts
  4. User PATH environment registry entries
  5. Temporary installer downloads and caches
Includes colored terminal output and safe confirmation prompts.
"""

import os
import sys
import shutil
import argparse
import subprocess
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
        h_stdout = kernel32.GetStdHandle(-11)
        mode = ctypes.c_ulong()
        if kernel32.GetConsoleMode(h_stdout, ctypes.byref(mode)):
            kernel32.SetConsoleMode(h_stdout, mode.value | 0x0004)
    except Exception:
        pass


def log_header(title: str):
    width = 72
    line = "=" * width
    print(f"\n{Color.BRIGHT_RED}{line}")
    print(f" {Color.BOLD}{Color.BRIGHT_WHITE}{title.center(width - 2)}{Color.RESET}{Color.BRIGHT_RED}")
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


def stop_active_processes():
    """Terminates any active Rust/Cargo/Tauri processes so files can be deleted cleanly."""
    target_procs = [
        "cargo.exe", "rustc.exe", "rustup.exe", "rust-analyzer.exe",
        "cargo-clippy.exe", "cargo-fmt.exe", "cargo-tauri.exe", "tauri.exe"
    ]
    stopped = 0
    for proc_name in target_procs:
        try:
            res = subprocess.run(["taskkill", "/F", "/IM", proc_name], capture_output=True, text=True)
            if res.returncode == 0:
                log_warning(f"Terminated active process: {Color.BRIGHT_YELLOW}{proc_name}{Color.RESET}")
                stopped += 1
        except Exception:
            pass
    if stopped == 0:
        log_info("No active Rust or Tauri processes were running.")


def run_rustup_uninstall() -> bool:
    """Attempts graceful self-uninstall via rustup."""
    try:
        res = subprocess.run(["rustup", "self", "uninstall", "-y"], capture_output=True, text=True)
        if res.returncode == 0:
            log_success("Official Rustup self-uninstall completed.")
            return True
    except Exception:
        pass
    return False


def remove_directory_safe(path_str: str, label: str):
    """Safely deletes a directory and reports status."""
    p = Path(os.path.expandvars(path_str))
    if p.exists():
        log_info(f"Removing {label}: {Color.DIM}{p}{Color.RESET}")
        try:
            shutil.rmtree(p, ignore_errors=True)
            if not p.exists():
                log_success(f"Removed {label}.")
            else:
                log_warning(f"Some files in {label} could not be locked/removed.")
        except Exception as e:
            log_error(f"Failed to delete {p}: {e}")
    else:
        log_info(f"{label} not found (already clean).")


def clean_user_path_registry():
    """Removes Cargo and Rust binary directories from HKCU\\Environment PATH."""
    cargo_bin = os.path.expandvars(r"%USERPROFILE%\.cargo\bin").lower()
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Environment", 0, winreg.KEY_ALL_ACCESS) as key:
            try:
                current_path, path_type = winreg.QueryValueEx(key, "Path")
            except FileNotFoundError:
                return

            entries = [p.strip() for p in current_path.split(";") if p.strip()]
            new_entries = [p for p in entries if p.lower() != cargo_bin and not p.lower().endswith(r"\.cargo\bin")]
            
            if len(entries) != len(new_entries):
                new_path = ";".join(new_entries)
                winreg.SetValueEx(key, "Path", 0, path_type, new_path)
                log_success("Removed Cargo bin from User Environment PATH in Registry.")
            else:
                log_info("User PATH registry does not contain Cargo entries.")
    except Exception as e:
        log_warning(f"Could not modify User PATH in registry: {e}")


def clean_temp_installers():
    """Cleans up temporary installer executables and bootstrapper files."""
    temp_dir = Path(tempfile.gettempdir())
    targets = [
        "rustup-init.exe",
        "vs_BuildTools.exe",
        "MicrosoftEdgeWebview2Setup.exe"
    ]
    for filename in targets:
        f = temp_dir / filename
        if f.exists():
            try:
                f.unlink(missing_ok=True)
                log_success(f"Cleaned temporary installer: {Color.DIM}{filename}{Color.RESET}")
            except Exception:
                pass


def main():
    parser = argparse.ArgumentParser(description="Tauri & Rust Dependencies Uninstaller")
    parser.add_argument("-y", "--yes", action="store_true", help="Skip confirmation prompt")
    parser.add_argument("--purge-project", action="store_true", help="Also remove the scaffolded AnEdiKit project folder")
    args = parser.parse_args()

    enable_windows_ansi_colors()
    log_header("Tauri & Rust Toolchain Deep Clean Uninstaller")

    print(f"{Color.BOLD}This script will remove:{Color.RESET}")
    print(f"  • Rust toolchains & compiler ({Color.BRIGHT_CYAN}rustup{Color.RESET}, {Color.BRIGHT_CYAN}rustc{Color.RESET}, {Color.BRIGHT_CYAN}cargo{Color.RESET})")
    print(f"  • User cargo & toolchain caches ({Color.DIM}%USERPROFILE%\\.cargo{Color.RESET}, {Color.DIM}%USERPROFILE%\\.rustup{Color.RESET})")
    print(f"  • Cargo PATH registration from Windows User Environment")
    print(f"  • Temporary installer files")
    if args.purge_project:
        print(f"  • {Color.BRIGHT_RED}AnEdiKit project directory{Color.RESET}")
    print()

    if not args.yes:
        confirm = input(f"{Color.BRIGHT_YELLOW}Are you sure you want to proceed with uninstallation? (y/N): {Color.RESET}").strip().lower()
        if confirm not in ("y", "yes"):
            print(f"\n{Color.BRIGHT_GREEN}[*] Uninstallation cancelled by user.{Color.RESET}")
            sys.exit(0)

    print()
    TOTAL_STEPS = 5

    # Step 1: Terminate active processes
    log_step(1, TOTAL_STEPS, "Stopping Active Processes")
    stop_active_processes()
    print()

    # Step 2: Graceful Rustup uninstall
    log_step(2, TOTAL_STEPS, "Running Rust Toolchain Uninstaller")
    run_rustup_uninstall()
    print()

    # Step 3: Remove Rust & Cargo directories
    log_step(3, TOTAL_STEPS, "Cleaning Cargo & Rust Directories")
    remove_directory_safe(r"%USERPROFILE%\.cargo", "Cargo Directory (.cargo)")
    remove_directory_safe(r"%USERPROFILE%\.rustup", "Rustup Directory (.rustup)")
    print()

    # Step 4: Clean PATH Registry
    log_step(4, TOTAL_STEPS, "Restoring Environment PATH")
    clean_user_path_registry()
    print()

    # Step 5: Clean Temp Installers & Optional Project Purge
    log_step(5, TOTAL_STEPS, "Cleaning Installer Artifacts")
    clean_temp_installers()
    
    if args.purge_project:
        project_dir = Path(__file__).resolve().parent.parent / "AnEdiKit"
        if project_dir.exists():
            log_warning(f"Purging project directory: {project_dir}")
            shutil.rmtree(project_dir, ignore_errors=True)
            log_success("Removed AnEdiKit project directory.")
            
    print()
    log_header("Uninstallation Complete")
    print(f"{Color.BRIGHT_GREEN}{Color.BOLD}[✓] Rust toolchain, Cargo directories, and PATH registrations have been cleaned.{Color.RESET}\n")


if __name__ == "__main__":
    main()
