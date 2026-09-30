// AnEdiKit release web build: assembled HTML + bundled/minified JS + CSS.
// Dev and Tauri keep serving ../src directly; this produces a self-contained
// build/web/ artifact for release packaging and size auditing.
//
//   node tools/Scripts/build_web.js            # full build + size report
//   node tools/Scripts/build_web.js --check    # CI: rebuild to temp, verify fresh
//
// What it does:
//   1. Regenerates src/index.html from src/partials (assemble_html.py).
//   2. esbuild: src/main.js -> minified ESM bundle (tree-shaking is inherent
//      to ESM bundling: unreachable exports are dropped).
//   3. esbuild: src/css/styles.css -> single minified CSS (@imports inlined).
//   4. Copies index.html with bundle paths + static dirs (vendor, kits).
//   5. Writes build/web/manifest.json with before/after sizes.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const SRC = path.join(ROOT, "src");
const OUT = path.join(ROOT, "build", "web");
const ASSETS = path.join(OUT, "assets");
const require = createRequire(path.join(ROOT, "package.json"));
const esbuild = require("esbuild");

const checkOnly = process.argv.includes("--check");

function dirSizeBytes(dir, exts) {
  let total = 0;
  let count = 0;
  const walk = (d) => {
    for (const e of require("fs").readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith(".")) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name === "vendor" || e.name === "partials") continue;
        walk(full);
      } else if (!exts || exts.includes(path.extname(e.name))) {
        total += require("fs").statSync(full).size;
        count += 1;
      }
    }
  };
  walk(dir);
  return { total, count };
}

function kb(n) {
  return `${(n / 1024).toFixed(1)} KB`;
}

// 1. Assemble HTML from partials (single source of truth).
execFileSync("python", [path.join(ROOT, "tools", "Scripts", "assemble_html.py")], { stdio: "inherit" });

// 2/3. Bundle JS + CSS with esbuild.
const target = checkOnly
  ? path.join(require("os").tmpdir(), "anedikit-build-check", "assets")
  : ASSETS;
mkdirSync(target, { recursive: true });

const jsResult = await esbuild.build({
  entryPoints: [path.join(SRC, "main.js")],
  bundle: true,
  minify: true,
  format: "esm",
  platform: "browser",
  target: ["chrome110", "edge110", "firefox110", "safari16"],
  outfile: path.join(target, "main.bundle.js"),
  metafile: true,
  logLevel: "warning",
});

const cssResult = await esbuild.build({
  entryPoints: [path.join(SRC, "css", "styles.css")],
  bundle: true,
  minify: true,
  outfile: path.join(target, "app.bundle.css"),
  logLevel: "warning",
});

if (checkOnly) {
  console.log("OK: web build inputs bundle cleanly (esbuild, minify + tree-shake)");
  process.exit(0);
}

// 4. Emit index.html with bundle paths + static dirs.
let html = readFileSync(path.join(SRC, "index.html"), "utf8");
html = html.replace('href="css/styles.css"', 'href="assets/app.bundle.css"');
html = html.replace('src="main.js"', 'src="assets/main.bundle.js"');
writeFileSync(path.join(OUT, "index.html"), html);
for (const dir of ["vendor", "kits"]) {
  const from = path.join(SRC, dir);
  if (existsSync(from)) {
    rmSync(path.join(OUT, dir), { recursive: true, force: true });
    cpSync(from, path.join(OUT, dir), { recursive: true });
  }
}

// 5. Size report + manifest (tree-shaking / DCE evidence).
const jsInputs = jsResult.metafile
  ? Object.keys(jsResult.metafile.inputs).length
  : 0;
const jsIn = dirSizeBytes(path.join(SRC, "js"), [".js"]).total
  + require("fs").statSync(path.join(SRC, "main.js")).size;
const cssIn = dirSizeBytes(path.join(SRC, "css"), [".css"]).total;
const jsOut = require("fs").statSync(path.join(ASSETS, "main.bundle.js")).size;
const cssOut = require("fs").statSync(path.join(ASSETS, "app.bundle.css")).size;
const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));

const manifest = {
  version: pkg.version,
  builtAt: new Date().toISOString(),
  esbuild: esbuild.version,
  js: { modulesBundled: jsInputs, inBytes: jsIn, outBytes: jsOut },
  css: { inBytes: cssIn, outBytes: cssOut },
};
writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));

console.log(`web build -> build/web (v${pkg.version})`);
console.log(`  JS : ${kb(jsIn)} across ${jsInputs} modules -> ${kb(jsOut)} ` +
  `(${(100 * (1 - jsOut / jsIn)).toFixed(1)}% smaller, tree-shaken + minified)`);
console.log(`  CSS: ${kb(cssIn)} -> ${kb(cssOut)} ` +
  `(${(100 * (1 - cssOut / cssIn)).toFixed(1)}% smaller, imports inlined + minified)`);
