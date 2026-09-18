import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import https from 'node:https';
import { createPrompter } from './prompt.js';
import { createSigningCert, defaultDevCertPath } from './new_signing_cert.js';
import os from 'node:os';

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

// Read configuration metadata (product name, version, title, identifier, description)
function getAppMetadata() {
  let productName = 'AnEdiKit';
  let version = '0.2.0';
  let identifier = 'com.user.anedikit';
  let description = 'All-in-one media toolkit';

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
      if (conf.identifier) {
        identifier = conf.identifier;
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
      if (pkg.description) {
        description = pkg.description;
      }
    } catch {
      // Use existing version
    }
  }

  return { productName, version, identifier, description };
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

// ---------------------------------------------------------------------------
// MSIX packaging (Windows only, opt-in via --msix).
// Tauri v2 has no native MSIX target, so the raw binary from target/release
// is staged with an AppxManifest + tile assets and packed with the Windows
// SDK makeappx.exe, then optionally signed with signtool.exe.
// ---------------------------------------------------------------------------

const MSIX_TIMESTAMP_URL = 'http://timestamp.digicert.com';

// Split our own flags out of the args forwarded to `tauri build`.
function parseMsixOptions(rawArgs) {
  const opts = {
    interactive: false,
    clean: false,
    msix: false,
    cert: null,
    certPassword: null,
    publisher: null,
    timestamp: false,
  };
  const tauriArgs = [];
  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === '--interactive' || arg === '-i') {
      opts.interactive = true;
    } else if (arg === '--clean') {
      opts.clean = true;
    } else if (arg === '--msix') {
      opts.msix = true;
    } else if (arg === '--msix-timestamp') {
      opts.timestamp = true;
    } else if (arg === '--msix-cert' && rawArgs[i + 1]) {
      opts.cert = rawArgs[++i];
    } else if (arg.startsWith('--msix-cert=')) {
      opts.cert = arg.slice('--msix-cert='.length);
    } else if (arg === '--msix-cert-password' && rawArgs[i + 1]) {
      opts.certPassword = rawArgs[++i];
    } else if (arg.startsWith('--msix-cert-password=')) {
      opts.certPassword = arg.slice('--msix-cert-password='.length);
    } else if (arg === '--msix-publisher' && rawArgs[i + 1]) {
      opts.publisher = rawArgs[++i];
    } else if (arg.startsWith('--msix-publisher=')) {
      opts.publisher = arg.slice('--msix-publisher='.length);
    } else {
      tauriArgs.push(arg);
    }
  }
  return { opts, tauriArgs };
}

// ---------------------------------------------------------------------------
// Interactive artifact picker (opt-in via --interactive; used by default when
// build_release.bat is double-clicked without arguments).
// ---------------------------------------------------------------------------

const INTERACTIVE_BUNDLES = [
  { id: 'nsis', label: 'NSIS setup installer (.exe)' },
  { id: 'msi', label: 'MSI installer (.msi)' },
  { id: 'msix', label: 'MSIX package (.msix)' },
];

// input/output injectable for testing; defaults to process stdio.
async function runInteractiveSetup(input = process.stdin, output = process.stdout) {
  const { ask, close } = createPrompter(input, output);
  try {
    output.write('\nSelect artifacts to build (Windows):\n');
    output.write('  Portable .exe is always produced.\n\n');
    INTERACTIVE_BUNDLES.forEach((c, i) => output.write(`  [${i + 1}] ${c.label}\n`));

    const raw = (await ask('\nEnter numbers separated by commas (default: all, e.g. 1,3): '))
      .trim()
      .toLowerCase();
    let picked;
    if (raw === '' || raw === 'all') {
      picked = INTERACTIVE_BUNDLES.map((c) => c.id);
    } else {
      picked = [
        ...new Set(
          raw
            .split(/[,\s]+/)
            .map((s) => parseInt(s, 10))
            .filter((n) => Number.isFinite(n) && n >= 1 && n <= INTERACTIVE_BUNDLES.length)
            .map((n) => INTERACTIVE_BUNDLES[n - 1].id),
        ),
      ];
      if (picked.length === 0) {
        output.write('No valid selection, building all.\n');
        picked = INTERACTIVE_BUNDLES.map((c) => c.id);
      }
    }

    const tauriArgs = [];
    const nativeBundles = picked.filter((x) => x === 'nsis' || x === 'msi');
    if (nativeBundles.length > 0) {
      tauriArgs.push('-b', ...nativeBundles);
    } else {
      // MSIX (or portable-only) needs just the raw binary.
      tauriArgs.push('--no-bundle');
    }

    const msixOpts = {
      msix: picked.includes('msix'),
      cert: null,
      certPassword: null,
      publisher: null,
      timestamp: false,
      cleanFirst: false,
    };

    if (msixOpts.msix) {
      output.write('\nMSIX signing:\n');
      output.write('  [1] Generate a new dev certificate (recommended for local testing)\n');
      output.write('  [2] Use my own .pfx certificate file\n');
      output.write('  [3] Leave unsigned (cannot be installed as-is)\n');
      const choice = (await ask('Select signing option [1]: ')).trim();

      if (choice === '2') {
        const cert = (await ask('Existing .pfx path: ')).trim().replace(/^"|"$/g, '');
        if (cert) {
          msixOpts.cert = cert;
          msixOpts.certPassword = await ask('PFX password [Enter = none, input is visible]: ');
          const ts = (await ask('Add RFC3161 timestamp? (requires network) (y/N): ')).trim().toLowerCase();
          msixOpts.timestamp = ts === 'y' || ts === 'yes';
        } else {
          output.write('No file given; leaving MSIX unsigned.\n');
        }
      } else if (choice === '3' || choice.toLowerCase() === 'unsigned') {
        output.write('Leaving MSIX unsigned.\n');
      } else {
        // Default: generate (choices '', '1', 'generate', or anything unrecognized).
        if (choice !== '' && choice !== '1' && choice.toLowerCase() !== 'generate') {
          output.write(`Unrecognized option "${choice}", generating a dev certificate.\n`);
        }
        try {
          const devCert = defaultDevCertPath();
          if (fs.existsSync(devCert)) {
            const reuse = (await ask(`Found existing ${path.relative(rootDir, devCert)}. Reuse it? (Y/n): `)).trim().toLowerCase();
            if (reuse === '' || reuse === 'y' || reuse === 'yes') {
              msixOpts.cert = devCert;
              msixOpts.certPassword = await ask('PFX password for the existing cert [Enter = none]: ');
              output.write(`Reusing ${devCert}\n`);
            } else {
              const pwd = await ask('Password for the new cert [Enter = none, input is visible]: ');
              const created = await createSigningCert({ password: pwd || null, force: true });
              msixOpts.cert = created.outPath;
              msixOpts.certPassword = pwd || null;
            }
          } else {
            const pwd = await ask('Password for the new cert [Enter = none, input is visible]: ');
            const created = await createSigningCert({ password: pwd || null });
            msixOpts.cert = created.outPath;
            msixOpts.certPassword = pwd || null;
          }
        } catch (err) {
          output.write(`[MSIX] Warning: certificate generation failed (${err.message}); leaving MSIX unsigned.\n`);
        }
      }
    }

    output.write(`\nBuilding: portable.exe${nativeBundles.map((b) => `, ${b}`).join('')}${msixOpts.msix ? ', msix' : ''}\n`);

    const cleanAns = (await ask('Clean previous build outputs first? (build/, src-tauri/target/; keeps *.pfx) (y/N): '))
      .trim()
      .toLowerCase();
    msixOpts.cleanFirst = cleanAns === 'y' || cleanAns === 'yes';
    output.write('\n');
    return { tauriArgs, msixOpts };
  } finally {
    close();
  }
}

// Locate a Windows SDK tool (makeappx.exe / signtool.exe), newest SDK first.
function findWindowsSdkTool(fileName) {
  const kitsRoot = path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Windows Kits', '10', 'bin');
  try {
    if (fs.existsSync(kitsRoot)) {
      const versions = fs.readdirSync(kitsRoot)
        .filter((v) => /^\d+\.\d+\.\d+\.\d+$/.test(v))
        .sort()
        .reverse();
      for (const ver of versions) {
        const candidate = path.join(kitsRoot, ver, 'x64', fileName);
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  } catch {
    // Fall through to PATH lookup
  }
  try {
    const where = execFileSync('where', [fileName], { encoding: 'utf8' });
    const first = where.split(/\r?\n/).map((l) => l.trim()).find(Boolean);
    if (first && fs.existsSync(first)) return first;
  } catch {
    // Not found
  }
  return null;
}

// MSIX Identity Version must be four dot-separated 0-65535 parts.
function toMsixVersion(version) {
  const parts = String(version).split('.').map((p) => parseInt(p, 10));
  while (parts.length < 4) parts.push(0);
  return parts.slice(0, 4).map((n) => (Number.isFinite(n) ? Math.min(65535, Math.max(0, n)) : 0)).join('.');
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Best-effort subject of a PFX so the manifest Publisher matches the
// signing certificate (required for installation). Uses .NET directly
// because Windows PowerShell 5.1 Get-PfxCertificate has no -Password flag.
function getPfxSubject(pfxPath, password) {
  try {
    const escPath = pfxPath.replace(/'/g, "''");
    const script = password
      ? `Add-Type -AssemblyName System.Security; (New-Object System.Security.Cryptography.X509Certificates.X509Certificate2('${escPath}', '${String(password).replace(/'/g, "''")}')).Subject`
      : `(Get-PfxCertificate -FilePath '${escPath}').Subject`;
    const out = execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8' });
    const subject = out.split(/\r?\n/).map((l) => l.trim()).find(Boolean);
    return subject || null;
  } catch {
    return null;
  }
}

function buildMsixManifest({ productName, identifier, msixVersion, publisher, exeName, arch, description }) {
  const normalizedArch = arch === 'arm64' ? 'arm64' : (arch === 'x86' ? 'x86' : 'x64');
  return `<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10" xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10" xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities">
  <Identity Name="${escapeXml(identifier)}" Publisher="${escapeXml(publisher)}" Version="${escapeXml(msixVersion)}" ProcessorArchitecture="${normalizedArch}" />
  <Properties>
    <DisplayName>${escapeXml(productName)}</DisplayName>
    <PublisherDisplayName>${escapeXml(productName)}</PublisherDisplayName>
    <Logo>Assets\\StoreLogo.png</Logo>
  </Properties>
  <Resources>
    <Resource Language="en-us" />
  </Resources>
  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.17763.0" MaxVersionTested="10.0.26100.0" />
  </Dependencies>
  <Capabilities>
    <rescap:Capability Name="runFullTrust" />
  </Capabilities>
  <Applications>
    <Application Id="App" Executable="${escapeXml(exeName)}" EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements DisplayName="${escapeXml(productName)}" Description="${escapeXml(description || productName)}" BackgroundColor="transparent" Square150x150Logo="Assets\\Square150x150Logo.png" Square44x44Logo="Assets\\Square44x44Logo.png" />
    </Application>
  </Applications>
</Package>
`;
}

// Stage exe + manifest + tile assets, pack with makeappx, sign if requested.
// Returns a release item ({ source, targetName, type }) or null on skip.
async function buildMsixPackage({ productName, version, identifier, arch, standaloneExePath, msixOpts, description }) {
  if (process.platform !== 'win32') {
    console.warn('[MSIX] Skipping: MSIX packaging requires Windows (makeappx.exe).');
    return null;
  }
  if (!standaloneExePath || !fs.existsSync(standaloneExePath)) {
    console.warn('[MSIX] Skipping: release executable not found in target/release.');
    return null;
  }

  const makeappx = findWindowsSdkTool('makeappx.exe');
  if (!makeappx) {
    console.warn('[MSIX] Skipping: makeappx.exe not found. Install the Windows 10/11 SDK.');
    return null;
  }

  const exeName = path.basename(standaloneExePath);
  const msixVersion = toMsixVersion(version);

  // Resolve Publisher: explicit flag wins, then signing cert subject, then default.
  let publisher = msixOpts.publisher || null;
  if (!publisher && msixOpts.cert) {
    publisher = getPfxSubject(msixOpts.cert, msixOpts.certPassword);
    if (publisher) {
      console.log(`[MSIX] Using Publisher from signing certificate: ${publisher}`);
    } else {
      console.warn('[MSIX] Warning: could not read certificate subject; falling back to default Publisher.');
    }
  }
  if (!publisher) publisher = 'CN=AnEdiKit';

  const stageDir = path.join(releaseOutputDir, 'msix-stage');
  const assetsDir = path.join(stageDir, 'Assets');
  fs.rmSync(stageDir, { recursive: true, force: true });
  fs.mkdirSync(assetsDir, { recursive: true });

  console.log('[MSIX] Staging package contents...');
  fs.copyFileSync(standaloneExePath, path.join(stageDir, exeName));

  const iconsDir = path.join(tauriDir, 'icons');
  const requiredAssets = ['Square44x44Logo.png', 'Square150x150Logo.png', 'StoreLogo.png'];
  for (const asset of requiredAssets) {
    const src = path.join(iconsDir, asset);
    if (!fs.existsSync(src)) {
      throw new Error(`[MSIX] Required tile asset missing: src-tauri/icons/${asset}`);
    }
    fs.copyFileSync(src, path.join(assetsDir, asset));
  }

  fs.writeFileSync(
    path.join(stageDir, 'AppxManifest.xml'),
    buildMsixManifest({ productName, identifier, msixVersion, publisher, exeName, arch, description }),
    'utf8',
  );

  const targetName = `${productName}-v${version}-windows-${arch}.msix`;
  const msixTmpPath = path.join(releaseOutputDir, `.${targetName}.tmp`);
  if (fs.existsSync(msixTmpPath)) fs.unlinkSync(msixTmpPath);

  console.log(`[MSIX] Packing with makeappx (${path.basename(path.dirname(path.dirname(makeappx)))})...`);
  execFileSync(makeappx, ['pack', '/d', stageDir, '/p', msixTmpPath, '/nv'], { stdio: 'inherit' });

  let type = 'MSIX Package (unsigned)';
  if (msixOpts.cert) {
    const signtool = findWindowsSdkTool('signtool.exe');
    if (!signtool) {
      console.warn('[MSIX] Warning: signtool.exe not found; leaving package unsigned.');
    } else {
      if (!fs.existsSync(msixOpts.cert)) {
        throw new Error(`[MSIX] Signing certificate not found: ${msixOpts.cert}`);
      }
      const signArgs = ['sign', '/fd', 'SHA256', '/f', msixOpts.cert];
      if (msixOpts.certPassword) signArgs.push('/p', msixOpts.certPassword);
      if (msixOpts.timestamp) signArgs.push('/tr', MSIX_TIMESTAMP_URL, '/td', 'SHA256');
      signArgs.push(msixTmpPath);
      console.log('[MSIX] Signing package...');
      execFileSync(signtool, signArgs, { stdio: 'inherit' });
      type = 'MSIX Package (signed)';
    }
  } else {
    console.warn('[MSIX] Package is UNSIGNED and cannot be installed as-is.');
    console.warn('[MSIX] Create a dev certificate with tools\\new_signing_cert.bat, then rebuild with:');
    console.warn('[MSIX]   build_release.bat --msix --msix-cert <file.pfx> [--msix-cert-password <pwd>]');
    console.warn('[MSIX] To sideload: install the cert under Trusted People, then Add-AppxPackage.');
  }

  return { tmpPath: msixTmpPath, targetName, type };
}

// ---------------------------------------------------------------------------
// Build cleanup: removes regenerable outputs (release dir, cargo target
// cache, temp concat lists). Signing certificates (*.pfx) are preserved.
// ---------------------------------------------------------------------------

function dirSizeBytes(dir) {
  let total = 0;
  try {
    if (!fs.existsSync(dir)) return 0;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      try {
        if (entry.isDirectory()) {
          total += dirSizeBytes(full);
        } else if (entry.isFile()) {
          total += fs.statSync(full).size;
        }
      } catch {
        // Unreadable entry; skip
      }
    }
  } catch {
    // Inaccessible dir; treat as empty
  }
  return total;
}

// overDir/tempDir injectable for testing; default to the real locations.
function performCleanup({ buildDir = releaseOutputDir, targetDir = path.join(tauriDir, 'target'), tempDir = null } = {}) {
  const results = [];
  let freed = 0;

  // 1. Release output dir (preserve signing certificates).
  try {
    if (fs.existsSync(buildDir)) {
      let kept = [];
      let size = 0;
      for (const entry of fs.readdirSync(buildDir)) {
        const full = path.join(buildDir, entry);
        if (/\.pfx$/i.test(entry)) {
          kept.push(entry);
          continue;
        }
        try {
          const st = fs.statSync(full);
          size += st.isDirectory() ? dirSizeBytes(full) : st.size;
          fs.rmSync(full, { recursive: true, force: true });
        } catch {
          // Locked entry; skip
        }
      }
      freed += size;
      results.push({ label: 'release output (build/)', freed: size, note: kept.length > 0 ? `preserved ${kept.join(', ')}` : null });
    } else {
      results.push({ label: 'release output (build/)', freed: 0, note: 'already absent' });
    }
  } catch (err) {
    results.push({ label: 'release output (build/)', freed: 0, note: `skipped: ${err.message}` });
  }

  // 2. Cargo target cache (the big one; fully regenerable via cargo build).
  try {
    if (fs.existsSync(targetDir)) {
      const size = dirSizeBytes(targetDir);
      fs.rmSync(targetDir, { recursive: true, force: true });
      freed += size;
      results.push({ label: 'cargo target cache (src-tauri/target/)', freed: size, note: null });
    } else {
      results.push({ label: 'cargo target cache (src-tauri/target/)', freed: 0, note: 'already absent' });
    }
  } catch (err) {
    results.push({ label: 'cargo target cache (src-tauri/target/)', freed: 0, note: `skipped: ${err.message}` });
  }

  // 3. Stale FFmpeg concat lists in the OS temp dir.
  try {
    const osTmp = tempDir || os.tmpdir();
    let count = 0;
    let size = 0;
    if (fs.existsSync(osTmp)) {
      for (const entry of fs.readdirSync(osTmp)) {
        if (/^anedikit_concat_.*\.txt$/i.test(entry)) {
          const full = path.join(osTmp, entry);
          try {
            size += fs.statSync(full).size;
            fs.rmSync(full, { force: true });
            count++;
          } catch {
            // Locked or vanished; skip
          }
        }
      }
    }
    freed += size;
    results.push({ label: 'temp concat lists', freed: size, note: count > 0 ? `${count} file(s)` : 'none found' });
  } catch (err) {
    results.push({ label: 'temp concat lists', freed: 0, note: `skipped: ${err.message}` });
  }

  return { results, freed };
}

function printCleanupSummary({ results, freed }) {
  console.log('\n[Clean] Build outputs cleanup:');
  for (const r of results) {
    const sizeStr = formatBytes(r.freed);
    const note = r.note ? ` (${r.note})` : '';
    console.log(` - ${r.label.padEnd(40)} [${sizeStr.padStart(9)}]${note}`);
  }
  console.log(`[Clean] Total reclaimed: ${formatBytes(freed)}\n`);
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
    let tauriCliPath = path.join(rootDir, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');
    if (!fs.existsSync(tauriCliPath)) {
      try {
        const pkgEntry = fileURLToPath(import.meta.resolve('@tauri-apps/cli'));
        tauriCliPath = path.join(path.dirname(pkgEntry), 'tauri.js');
      } catch {
        tauriCliPath = path.join(rootDir, 'node_modules', '@tauri-apps', 'cli', 'main.js');
      }
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
    console.log('Usage: node tools/scripts/build_release.js [tauri build options] [--msix ...]');
    console.log('');
    console.log('Options:');
    console.log('  -b, --bundles <BUNDLES>  Bundles to package (e.g. nsis, msi)');
    console.log('  -t, --target <TARGET>    Target triple to build against');
    console.log('  --no-bundle              Build binary only without installer bundles');
    console.log('  -v, --verbose            Enable verbose build output');
    console.log('  --msix                   Also generate an MSIX package (Windows only,');
    console.log('                           uses the raw binary; works with --no-bundle)');
    console.log('  --msix-cert <file.pfx>   Sign the MSIX with a PFX certificate');
    console.log('  --msix-cert-password <pwd>  Password for the PFX certificate');
    console.log('  --msix-publisher <name>  Override manifest Publisher (default: cert');
    console.log('                           subject, else CN=AnEdiKit; must match the');
    console.log('                           signing certificate when installing)');
    console.log('  --msix-timestamp         Timestamp the signature (requires network)');
    console.log('  -i, --interactive        Ask which artifacts to build (bundles, MSIX');
    console.log('                           signing) instead of passing flags manually');
    console.log('  --clean                  Remove regenerable build outputs (build/,');
    console.log('                           src-tauri/target/, temp concat lists; keeps');
    console.log('                           *.pfx) and exit without building');
    console.log('  -h, --help               Show this help message');
    return;
  }

  const { opts: cliOpts, tauriArgs: cliTauriArgs } = parseMsixOptions(rawArgs);

  // Clean-only mode: report and exit before any build work.
  if (cliOpts.clean && !cliOpts.interactive) {
    printCleanupSummary(performCleanup());
    return;
  }

  let tauriArgs = cliTauriArgs;
  let msixOpts = cliOpts;
  if (cliOpts.interactive) {
    if (process.stdin.isTTY) {
      ({ tauriArgs, msixOpts } = await runInteractiveSetup());
      if (msixOpts.cleanFirst) {
        printCleanupSummary(performCleanup());
      }
    } else {
      console.warn('[Build] Warning: --interactive needs a terminal; continuing with defaults.');
    }
  }

  const { productName, version, identifier, description } = getAppMetadata();
  const arch = process.arch === 'x64' ? 'x64' : (process.arch === 'arm64' ? 'arm64' : process.arch);
  const platform = process.platform === 'win32' ? 'windows' : (process.platform === 'darwin' ? 'macos' : 'linux');

  console.log('====================================================');
  console.log(` Building Release: ${productName} v${version} (${platform}-${arch})`);
  console.log('====================================================');

  await ensureWindowsToolchains();

  await runTauriBuild(tauriArgs);

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

      // If bundle filename contains a version string, ensure it matches the current version
      const fileVersionMatch = fileName.match(/\d+\.\d+\.\d+/);
      if (fileVersionMatch && fileVersionMatch[0] !== version) {
        continue;
      }

      if (targetName) {
        const existingIdx = releaseItems.findIndex((item) => item.targetName === targetName);
        if (existingIdx >= 0) {
          releaseItems[existingIdx] = { source: filePath, targetName, type };
        } else {
          releaseItems.push({
            source: filePath,
            targetName,
            type,
          });
        }
      }
    }
  }

  // 3. MSIX package (opt-in via --msix, staged from the raw binary)
  if (msixOpts.msix) {
    console.log('\n[Build] Generating MSIX package...');
    const msixItem = await buildMsixPackage({
      productName,
      version,
      identifier,
      arch,
      standaloneExePath,
      msixOpts,
      description,
    });
    if (msixItem) {
      releaseItems.push({
        source: msixItem.tmpPath,
        targetName: msixItem.targetName,
        type: msixItem.type,
      });
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
