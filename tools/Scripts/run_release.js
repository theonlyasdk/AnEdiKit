// Launches the locally-built release binary (GUI, detached).
// Build it first with the "Build release" option in launch.bat (or: node tools/Scripts/build_release.js --no-bundle)
// (Tauri has no `run --release`: `tauri dev` is debug-only, so release means
// building with `tauri build` and launching the produced executable.)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');
const tauriDir = path.join(rootDir, 'src-tauri');

function getAppMetadata() {
  let productName = 'AnEdiKit';
  const tauriConfPath = path.join(tauriDir, 'tauri.conf.json');
  if (fs.existsSync(tauriConfPath)) {
    try {
      const conf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
      if (conf.app?.windows?.[0]?.title) {
        productName = conf.app.windows[0].title.replace(/\s+/g, '');
      } else if (conf.productName) {
        productName = conf.productName.charAt(0).toUpperCase() + conf.productName.slice(1);
      }
    } catch {
      // Use default
    }
  }
  return { productName };
}

export function findReleaseBinary() {
  const { productName } = getAppMetadata();
  const targetDir = path.join(tauriDir, 'target', 'release');
  const exe = process.platform === 'win32' ? '.exe' : '';
  const candidates = [
    `anedikit${exe}`,
    `${productName.toLowerCase()}${exe}`,
    `${productName}${exe}`,
  ];
  for (const name of candidates) {
    const full = path.join(targetDir, name);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

async function main() {
  const binary = findReleaseBinary();
  if (!binary) {
    console.error('[Run] No release binary found in src-tauri/target/release/.');
    console.error('[Run] Build it first with the "Build release" option in launch.bat (or: node tools/Scripts/build_release.js --no-bundle)');
    process.exit(1);
  }
  console.log(`[Run] Launching release build: ${binary}`);
  const child = spawn(binary, [], { detached: true, stdio: 'ignore', cwd: rootDir });
  child.unref();
}

// Only launch when executed directly (importable for tests).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('[Run] Failed:', err.message || err);
    process.exit(1);
  });
}
