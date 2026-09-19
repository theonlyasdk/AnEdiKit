// Creates a self-signed code-signing certificate for local MSIX/app signing.
// Wraps PowerShell PKI cmdlets: generates the cert in CurrentUser\My,
// exports it as PFX, and (by default) installs it into CurrentUser\TrustedPeople
// so locally-signed MSIX packages pass Add-AppxPackage signature checks.
//
// Usage:
//   node tools/Scripts/new_signing_cert.js [--subject CN=AnEdiKit]
//     [--password <pwd>] [--out <file.pfx>] [--years 5] [--no-install] [--force]
//
// Defaults match build_release.js MSIX Publisher expectations (CN=AnEdiKit).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createPrompter } from './prompt.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');

function parseArgs(rawArgs) {
  const opts = {
    subject: null,
    password: null,
    out: null,
    years: 5,
    install: true,
    force: false,
  };
  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === '--help' || arg === '-h') return { help: true, opts };
    if (arg === '--no-install') opts.install = false;
    else if (arg === '--force') opts.force = true;
    else if (arg === '--subject' && rawArgs[i + 1]) opts.subject = rawArgs[++i];
    else if (arg.startsWith('--subject=')) opts.subject = arg.slice('--subject='.length);
    else if (arg === '--password' && rawArgs[i + 1]) opts.password = rawArgs[++i];
    else if (arg.startsWith('--password=')) opts.password = arg.slice('--password='.length);
    else if (arg === '--out' && rawArgs[i + 1]) opts.out = rawArgs[++i];
    else if (arg.startsWith('--out=')) opts.out = arg.slice('--out='.length);
    else if (arg === '--years' && rawArgs[i + 1]) opts.years = parseInt(rawArgs[++i], 10);
    else if (arg.startsWith('--years=')) opts.years = parseInt(arg.slice('--years='.length), 10);
  }
  return { opts };
}

function psEscape(value) {
  return String(value).replace(/'/g, "''");
}

function runPs(script) {
  return execFileSync(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
}

export function defaultDevCertPath() {
  return path.join(rootDir, 'build', 'AnEdiKit-dev-sign.pfx');
}

// Non-interactive core: generates the cert, exports the PFX and optionally
// installs it for sideload trust. Shared by the CLI and the release builder.
// Returns { thumbprint, outPath, subject }.
export async function createSigningCert({ subject = 'CN=AnEdiKit', password = null, out = null, years = 5, install = true, force = false } = {}) {
  if (process.platform !== 'win32') {
    throw new Error('Certificate generation requires Windows (PowerShell PKI cmdlets).');
  }
  if (!subject) subject = 'CN=AnEdiKit';
  if (!out) out = defaultDevCertPath();
  if (!Number.isFinite(years) || years < 1 || years > 30) years = 5;
  out = path.resolve(out);

  if (fs.existsSync(out) && !force) {
    throw new Error(`Output file already exists: ${out} (use --force to overwrite)`);
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });

  console.log(`[Cert] Subject : ${subject}`);
  console.log(`[Cert] Output  : ${out}`);
  console.log(`[Cert] Validity: ${years} year(s)`);

  // 1. Generate an exportable SHA256 code-signing cert in CurrentUser\My.
  // The code-signing EKU (1.3.6.1.5.5.7.3.3) is required by signtool/MSIX.
  console.log('[Cert] Generating self-signed code-signing certificate...');
  const createScript = [
    `$cert = New-SelfSignedCertificate -Type CodeSigningCert`,
    `-Subject '${psEscape(subject)}'`,
    `-FriendlyName '${psEscape(subject)} dev signing'`,
    `-NotAfter ((Get-Date).AddYears(${years}))`,
    `-CertStoreLocation 'Cert:\\CurrentUser\\My'`,
    `-KeyExportPolicy Exportable -KeySpec Signature -KeyLength 2048`,
    `-HashAlgorithm SHA256`,
    `-TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3')`,
    `; $cert.Thumbprint`,
  ].join(' ');
  const thumbprint = runPs(createScript).trim().split(/\r?\n/).map((l) => l.trim()).find(Boolean);
  if (!thumbprint) throw new Error('Certificate creation produced no thumbprint.');
  console.log(`[Cert] Thumbprint: ${thumbprint}`);

  try {
    // 2. Export to PFX (signtool input).
    console.log('[Cert] Exporting PFX...');
    const exportScript = password
      ? `$p = ConvertTo-SecureString -String '${psEscape(password)}' -AsPlainText -Force; Export-PfxCertificate -Cert 'Cert:\\CurrentUser\\My\\${thumbprint}' -FilePath '${psEscape(out)}' -Password $p | Out-Null; 'OK'`
      : `Export-PfxCertificate -Cert 'Cert:\\CurrentUser\\My\\${thumbprint}' -FilePath '${psEscape(out)}' | Out-Null; 'OK'`;
    runPs(exportScript);

    // 3. Trust for local sideload: signature checks consult TrustedPeople.
    if (install) {
      console.log('[Cert] Installing into CurrentUser\\TrustedPeople for sideload trust...');
      const installScript = password
        ? `$p = ConvertTo-SecureString -String '${psEscape(password)}' -AsPlainText -Force; Import-PfxCertificate -FilePath '${psEscape(out)}' -CertStoreLocation 'Cert:\\CurrentUser\\TrustedPeople' -Password $p -Exportable | Out-Null; 'OK'`
        : `Import-PfxCertificate -FilePath '${psEscape(out)}' -CertStoreLocation 'Cert:\\CurrentUser\\TrustedPeople' -Exportable | Out-Null; 'OK'`;
      runPs(installScript);
    }

    console.log('\n====================================================');
    console.log(' Signing certificate ready.');
    console.log(` PFX file : ${out}`);
    if (password) {
      console.log(' Password : (the one you provided; needed for --msix-cert-password)');
    } else {
      console.log(' Password : none (signtool may still prompt; prefer setting one)');
    }
    console.log('\n Sign your MSIX with:');
    console.log(`   node tools/Scripts/build_release.js --msix --msix-cert "${out}"${password ? ' --msix-cert-password <pwd>' : ''}`);
    console.log('====================================================\n');
    return { thumbprint, outPath: out, subject };
  } catch (err) {
    // Don't leave a half-trusted cert behind on failure.
    try {
      runPs(`Remove-Item -Path 'Cert:\\CurrentUser\\My\\${thumbprint}' -Force; Remove-Item -Path 'Cert:\\CurrentUser\\TrustedPeople\\${thumbprint}' -Force -ErrorAction SilentlyContinue; 'OK'`);
    } catch {
      // Best effort only
    }
    throw err;
  }
}

async function main() {
  const { help, opts } = parseArgs(process.argv.slice(2));
  if (help) {
    console.log('Self-signed code-signing certificate generator');
    console.log('Usage: node tools/Scripts/new_signing_cert.js [options]');
    console.log('');
    console.log('Options:');
    console.log('  --subject <name>   Certificate subject (default: CN=AnEdiKit)');
    console.log('  --password <pwd>   PFX password (prompted when signing needs one)');
    console.log('  --out <file.pfx>   Output path (default: build/AnEdiKit-dev-sign.pfx)');
    console.log('  --years <n>        Validity in years (default: 5)');
    console.log('  --no-install       Skip installing into TrustedPeople (sideload trust)');
    console.log('  --force            Overwrite an existing PFX file');
    console.log('  -h, --help         Show this help message');
    return;
  }

  if (process.platform !== 'win32') {
    throw new Error('Certificate generation requires Windows (PowerShell PKI cmdlets).');
  }

  const interactive = process.stdin.isTTY && !opts.subject && !opts.password && !opts.out;
  let { subject, password, out, years, install, force } = opts;

  if (interactive) {
    const { ask, close } = createPrompter();
    try {
      const s = (await ask('Subject [CN=AnEdiKit]: ')).trim();
      if (s) subject = s;
      const p = await ask('PFX password [Enter = none, input is visible]: ');
      if (p) password = p;
      const o = (await ask('Output PFX path [build/AnEdiKit-dev-sign.pfx]: ')).trim().replace(/^"|"$/g, '');
      if (o) out = o;
    } finally {
      close();
    }
  }

  await createSigningCert({ subject, password, out, years, install, force });
}

// Only run the CLI when executed directly (importable by build_release.js).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('\n[Certificate Generation Failed]:', err.message || err);
    process.exit(1);
  });
}
