import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import https from 'node:https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');
const tauriDir = path.join(rootDir, 'src-tauri');
const releaseOutputDir = path.join(rootDir, 'build');

// Helper to format bytes into human-readable string
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

// Calculate SHA-256 hash of a file
function getSha256(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

// Download a file with redirect support
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        return downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        return reject(new Error(`Failed to download ${url} (HTTP ${response.statusCode})`));
      }
      const fileStream = fs.createWriteStream(destPath);
      response.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
        resolve();
      });
      fileStream.on('error', reject);
    }).on('error', reject);
  });
}

// Read configuration metadata (product name, version, title)
function getAppMetadata() {
  let productName = 'AnEdiKit';
  let version = '0.2.0';

  const tauriConfPath = path.join(tauriDir, 'tauri.conf.json');
  if (fs.existsSync(tauriConfPath)) {
    try {
      const conf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
      if (conf.app?.windows?.[0]?.title) {
        productName = conf.app.windows[0].title.replace(/\s+/g, '');
      } else if (conf.productName) {
        productName = conf.productName.charAt(0).toUpperCase() + conf.productName.slice(1);
      }
      if (conf.version) {
        version = conf.version;
      }
    } catch {
      // Use defaults if config cannot be parsed
    }
  }

  const pkgPath = path.join(rootDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.version) {
        version = pkg.version;
      }
    } catch {
      // Use existing version
    }
  }

  return { productName, version };
}

// Ensure Windows bundling toolchains (NSIS and WiX) are cached
async function ensureWindowsToolchains() {
  if (process.platform !== 'win32') return;

  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) return;

  const tauriCacheDir = path.join(localAppData, 'tauri');
  fs.mkdirSync(tauriCacheDir, { recursive: true });

  const nsisDir = path.join(tauriCacheDir, 'NSIS');
  const nsisExe = path.join(nsisDir, 'makensis.exe');
  const nsisUtilsDll = path.join(nsisDir, 'Plugins', 'x86-unicode', 'additional', 'nsis_tauri_utils.dll');

  if (!fs.existsSync(nsisExe) || !fs.existsSync(nsisUtilsDll)) {
    console.log('[Toolchain] Setting up NSIS 3.11 for Windows installer bundling...');
    fs.mkdirSync(path.dirname(nsisUtilsDll), { recursive: true });
    
    const nsisZip = path.join(tauriCacheDir, 'nsis-temp.zip');
    try {
      if (!fs.existsSync(nsisExe)) {
        await downloadFile('https://github.com/tauri-apps/binary-releases/releases/download/nsis-3.11/nsis-3.11.zip', nsisZip);
        const { execSync } = await import('node:child_process');
        execSync(`powershell -Command "Expand-Archive -Path '${nsisZip}' -DestinationPath '${tauriCacheDir}' -Force; if (Test-Path '${path.join(tauriCacheDir, 'nsis-3.11')}') { Move-Item -Force '${path.join(tauriCacheDir, 'nsis-3.11')}' '${nsisDir}' }"`);
        if (fs.existsSync(nsisZip)) fs.unlinkSync(nsisZip);
      }
      if (!fs.existsSync(nsisUtilsDll)) {
        await downloadFile('https://github.com/tauri-apps/nsis-tauri-utils/releases/download/nsis_tauri_utils-v0.5.3/nsis_tauri_utils.dll', nsisUtilsDll);
      }
    } catch (err) {
      console.warn(`[Toolchain] Warning: Auto-caching NSIS encountered: ${err.message}. Continuing with build.`);
    }
  }

  const wixDir = path.join(tauriCacheDir, 'WixTools314');
  const wixCandle = path.join(wixDir, 'candle.exe');
  if (!fs.existsSync(wixCandle)) {
    console.log('[Toolchain] Setting up WiX 3.14 for MSI bundling...');
    const wixZip = path.join(tauriCacheDir, 'wix-temp.zip');
    try {
      await downloadFile('https://github.com/wixtoolset/wix3/releases/download/wix3141rtm/wix314-binaries.zip', wixZip);
      fs.mkdirSync(wixDir, { recursive: true });
      const { execSync } = await import('node:child_process');
      execSync(`powershell -Command "Expand-Archive -Path '${wixZip}' -DestinationPath '${wixDir}' -Force"`);
      if (fs.existsSync(wixZip)) fs.unlinkSync(wixZip);
    } catch (err) {
      console.warn(`[Toolchain] Warning: Auto-caching WiX encountered: ${err.message}. Continuing with build.`);
    }
  }
}

// Find all files in a directory recursively
function getFilesRecursively(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getFilesRecursively(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

// Run Tauri build CLI
function runTauriBuild(extraArgs = []) {
  return new Promise((resolve, reject) => {
    let tauriCliPath;
    try {
      tauriCliPath = fileURLToPath(import.meta.resolve('@tauri-apps/cli'));
    } catch {
      tauriCliPath = path.join(rootDir, 'node_modules', '@tauri-apps', 'cli', 'main.js');
    }

    const args = [tauriCliPath, 'build', ...extraArgs];
    console.log(`[Build] Running: node ${path.relative(rootDir, tauriCliPath)} build ${extraArgs.join(' ')}`);

    const child = spawn(process.execPath, args, {
      cwd: rootDir,
      stdio: 'inherit',
      env: process.env,
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Tauri build exited with code ${code}`));
      }
    });
    child.on('error', reject);
  });
}

// Main release execution workflow
async function main() {
  const startTime = Date.now();
  const rawArgs = process.argv.slice(2);

  if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
    console.log('AnEdiKit Release Builder');
    console.log('Usage: node tools/scripts/build_release.js [tauri build options]');
    console.log('');
    console.log('Options:');
    console.log('  -b, --bundles <BUNDLES>  Bundles to package (e.g. nsis, msi)');
    console.log('  -t, --target <TARGET>    Target triple to build against');
    console.log('  --no-bundle              Build binary only without installer bundles');
    console.log('  -v, --verbose            Enable verbose build output');
    console.log('  -h, --help               Show this help message');
    return;
  }

  const { productName, version } = getAppMetadata();
  const arch = process.arch === 'x64' ? 'x64' : (process.arch === 'arm64' ? 'arm64' : process.arch);
  const platform = process.platform === 'win32' ? 'windows' : (process.platform === 'darwin' ? 'macos' : 'linux');

  console.log('====================================================');
  console.log(` Building Release: ${productName} v${version} (${platform}-${arch})`);
  console.log('====================================================');

  await ensureWindowsToolchains();

  await runTauriBuild(rawArgs);

  console.log('\n[Build] Preparing build directory...');
  fs.mkdirSync(releaseOutputDir, { recursive: true });

  // Locate target release directory
  const targetDir = path.join(tauriDir, 'target', 'release');
  const bundleDir = path.join(targetDir, 'bundle');

  if (!fs.existsSync(targetDir)) {
    throw new Error(`Target directory not found at ${targetDir}`);
  }

  // Collect release artifacts
  const releaseItems = [];

  // 1. Standalone executable
  const binaryNames = ['anedikit.exe', `${productName.toLowerCase()}.exe`, `${productName}.exe`];
  let standaloneExePath = null;
  for (const binName of binaryNames) {
    const candidate = path.join(targetDir, binName);
    if (fs.existsSync(candidate)) {
      standaloneExePath = candidate;
      break;
    }
  }

  if (standaloneExePath) {
    const targetName = `${productName}-v${version}-${platform}-${arch}-portable.exe`;
    releaseItems.push({
      source: standaloneExePath,
      targetName,
      type: 'Portable Executable',
    });
  }

  // 2. Bundles (Installers, packages, signatures)
  if (fs.existsSync(bundleDir)) {
    const bundleFiles = getFilesRecursively(bundleDir);

    for (const filePath of bundleFiles) {
      const ext = path.extname(filePath).toLowerCase();
      const fileName = path.basename(filePath).toLowerCase();

      // Skip intermediate files
      if (['.wixpdb', '.pdb', '.d', '.rlib', '.rmeta', '.obj'].includes(ext)) {
        continue;
      }

      let targetName = null;
      let type = 'Installer';

      if (filePath.includes(`${path.sep}nsis${path.sep}`) || fileName.includes('setup') || fileName.includes('nsis')) {
        if (ext === '.exe') {
          targetName = `${productName}-v${version}-${platform}-${arch}-setup.exe`;
          type = 'NSIS Setup Installer';
        } else if (ext === '.zip') {
          targetName = `${productName}-v${version}-${platform}-${arch}-nsis.zip`;
          type = 'NSIS Archive';
        } else if (ext === '.sig') {
          targetName = `${productName}-v${version}-${platform}-${arch}-setup.exe.sig`;
          type = 'NSIS Signature';
        }
      } else if (filePath.includes(`${path.sep}msi${path.sep}`) || ext === '.msi') {
        if (ext === '.msi') {
          targetName = `${productName}-v${version}-${platform}-${arch}-installer.msi`;
          type = 'MSI Windows Installer';
        } else if (ext === '.zip') {
          targetName = `${productName}-v${version}-${platform}-${arch}-msi.zip`;
          type = 'MSI Archive';
        } else if (ext === '.sig') {
          targetName = `${productName}-v${version}-${platform}-${arch}-installer.msi.sig`;
          type = 'MSI Signature';
        }
      } else if (ext === '.deb') {
        targetName = `${productName}-v${version}-${arch}.deb`;
        type = 'Debian Package';
      } else if (ext === '.appimage') {
        targetName = `${productName}-v${version}-${arch}.AppImage`;
        type = 'AppImage';
      } else if (ext === '.dmg') {
        targetName = `${productName}-v${version}-${arch}.dmg`;
        type = 'macOS Disk Image';
      } else if (['.exe', '.msi', '.zip', '.tar.gz', '.pkg'].includes(ext)) {
        targetName = `${productName}-v${version}-${platform}-${arch}${ext}`;
        type = `${ext.toUpperCase().replace('.', '')} Bundle`;
      }

      if (targetName) {
        releaseItems.push({
          source: filePath,
          targetName,
          type,
        });
      }
    }
  }

  if (releaseItems.length === 0) {
    console.warn('[Release] Warning: No release files found to copy.');
    return;
  }

  // Copy files to build/ in flat structure
  console.log('\n[Build] Copying files to build/ folder:');
  const checksums = [];

  for (const item of releaseItems) {
    const destPath = path.join(releaseOutputDir, item.targetName);
    fs.copyFileSync(item.source, destPath);

    const stats = fs.statSync(destPath);
    const sizeStr = formatBytes(stats.size);
    const hash = getSha256(destPath);
    checksums.push(`${hash}  ${item.targetName}`);

    console.log(` - ${item.targetName.padEnd(50)} [${sizeStr.padStart(9)}] (${item.type})`);
  }

  // Write SHA256 checksums file
  const checksumFilePath = path.join(releaseOutputDir, 'SHA256SUMS.txt');
  fs.writeFileSync(checksumFilePath, checksums.join('\n') + '\n', 'utf8');
  console.log(` - SHA256SUMS.txt`.padEnd(53) + ` [${formatBytes(fs.statSync(checksumFilePath).size).padStart(9)}] (SHA256 Checksums)`);

  const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n====================================================');
  console.log(` Release build completed in ${elapsedSeconds}s!`);
  console.log(` Output location: ${releaseOutputDir}`);
  console.log('====================================================\n');
}

main().catch((err) => {
  console.error('\n[Release Build Failed]:', err);
  process.exit(1);
});
