// Capture documentation screenshots of every AnEdiKit page.
//
// Serves `src/` over a local HTTP server, drives headless Chrome through the
// DevTools Protocol, walks the sidebar (every `button[data-tool]`), and writes
// one PNG per page into `docs/screenshots/<app version>/`.
//
// Desktop pages land in the version folder itself; mobile-width pages land in a
// `mobile/` subfolder, where a few pages are also captured with the navigation
// drawer open. Dialogs are captured last, as modal_*.png in the version folder.
//
// Usage: node tools/Scripts/capture_screenshots.js [--mode desktop|mobile|both] [--out <dir>]

import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');
const srcDir = path.join(rootDir, 'src');
const testImagesDir = path.join(rootDir, 'test', 'images');

// The comparison dialog loads images through `src`, which only resolves in
// http(s)/data/blob form outside Tauri, so the capture server exposes the test
// fixtures on a private route and the dialog is handed those URLs.
const ASSET_MOUNT = '/__assets/';
const COMPARISON_SOURCE = `${ASSET_MOUNT}fake_transparency.jpg`;
const COMPARISON_RESULT = `${ASSET_MOUNT}test_perfect_cutout.png`;

// Desktop matches Tauri's default 1100x720 window shape; mobile is a common
// phone width, where the sidebar becomes a drawer. Both capture at 1.5-2x so
// text stays crisp in the docs.
const VIEWPORTS = {
  desktop: { width: 1280, height: 800, scale: 1.5 },
  mobile: { width: 390, height: 844, scale: 2 },
};

// Pages that also get a second capture with the mobile navigation drawer open,
// one per sidebar section (FFmpeg, Image & AI, yt-dlp, Settings).
const DRAWER_TOOLS = ['convert', 'bg_remover', 'ytdlp_video', 'settings'];

const PAGE_SETTLE_MS = 900;
const LAUNCH_TIMEOUT_MS = 30000;
// Safety net for runaway pages; every current page fits well under this.
const FULL_HEIGHT_CAP = 5000;

// The app scrolls inside its own panels instead of the document, so a plain
// viewport shot cuts pages off. Each capture grows the emulated viewport until
// the measured containers stop overflowing.
// A tool page must show its whole workspace and the whole sidebar list.
const PAGE_FIT_EXPR = `(() => {
  const header = document.getElementById('top-header-bar')?.offsetHeight || 0;
  const workspace = document.getElementById('tool-workspace');
  const sidebar = document.getElementById('sidebar-scroll-container');
  const page = header + (workspace ? workspace.scrollHeight : 0);
  const nav = header + (sidebar ? sidebar.scrollHeight : 0);
  return { required: Math.max(page, nav), page, nav };
})()`;

// The drawer replaces the workspace, so only its own list and footer matter.
const DRAWER_FIT_EXPR = `(() => {
  const header = document.getElementById('top-header-bar')?.offsetHeight || 0;
  const sidebar = document.getElementById('sidebar-scroll-container');
  const footer = document.getElementById('mobile-sidebar-settings-col');
  const nav = header + (sidebar ? sidebar.scrollHeight : 0) + (footer ? footer.offsetHeight : 0);
  return { required: nav, page: nav, nav };
})()`;

// Dialogs only need enough height for their own scroll regions to stop clipping.
const MODAL_FIT_EXPR = `(() => {
  const modal = document.querySelector('.modal.show, #image-comparison-modal:not(.d-none)');
  if (!modal) return { required: 0 };
  let missing = 0;
  [modal, ...modal.querySelectorAll('.modal-dialog, .modal-content, .modal-body')].forEach((el) => {
    missing = Math.max(missing, el.scrollHeight - el.clientHeight);
  });
  return { required: window.innerHeight + Math.max(0, missing) };
})()`;

// Dialogs worth documenting, in the order they are captured. `setup` puts the
// matching tool on screen behind the dialog, `verify` proves the dialog holds
// real content rather than an empty shell.
const MODALS = [
  {
    file: 'modal_credits.png',
    label: 'credits',
    open: 'document.getElementById("brand-logo-title").click()',
    isOpen: '!!document.querySelector("#credits-modal.show")',
    close: 'window.bootstrap.Modal.getOrCreateInstance(document.getElementById("credits-modal")).hide()',
    isClosed: '!document.querySelector("#credits-modal.show")',
  },
  {
    file: 'modal_filename_format_editor.png',
    label: 'filename format editor',
    setup: 'window.switchAppTool("ytdlp_video")',
    open: 'document.getElementById("btn-edit-ytdlp-filename-format").click()',
    isOpen: '!!document.querySelector("#modal-filename-format-editor.show")',
    close:
      'window.bootstrap.Modal.getOrCreateInstance(document.getElementById("modal-filename-format-editor")).hide()',
    isClosed: '!document.querySelector("#modal-filename-format-editor.show")',
  },
  {
    file: 'modal_comparison.png',
    label: 'comparison view',
    setup: 'window.switchAppTool("bg_remover")',
    open: `window.openComparisonModal(${JSON.stringify(COMPARISON_SOURCE)}, ${JSON.stringify(COMPARISON_RESULT)}, 'Background Remover')`,
    isOpen: '!document.getElementById("image-comparison-modal").classList.contains("d-none")',
    // Both halves must have decoded, otherwise the stage is empty.
    verify: `(() => {
      const loaded = (id) => {
        const img = document.getElementById(id);
        return !!img && img.complete && img.naturalWidth > 0;
      };
      return loaded('comp-split-before-img') && loaded('comp-split-after-img');
    })()`,
    close: 'document.getElementById("btn-comp-close-x").click()',
    isClosed: 'document.getElementById("image-comparison-modal").classList.contains("d-none")',
  },
];

const MIME_TYPES = {
  '.css': 'text/css',
  '.gif': 'image/gif',
  '.html': 'text/html',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.mjs': 'text/javascript',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function log(message) {
  process.stdout.write(`${message}\n`);
}

function readAppVersion() {
  for (const file of ['src-tauri/tauri.conf.json', 'package.json']) {
    const fullPath = path.join(rootDir, file);
    if (!fs.existsSync(fullPath)) continue;
    try {
      const version = JSON.parse(fs.readFileSync(fullPath, 'utf8')).version;
      if (version) return version;
    } catch (err) {
      log(`Could not read ${file}: ${err.message}`);
    }
  }
  throw new Error('Unable to determine the app version');
}

function findChromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    `${process.env.LOCALAPPDATA || ''}/Google/Chrome/Application/chrome.exe`,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  throw new Error('Chrome not found. Set CHROME_PATH to the Chrome (or Chromium) executable.');
}

function slugify(label) {
  return `${label}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

// ---------------------------------------------------------------- HTTP server

function startStaticServer() {
  const serveFile = (res, filePath) => {
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404).end('Not found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(data);
    });
  };

  const server = http.createServer((req, res) => {
    const requestPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const isAsset = requestPath.startsWith(ASSET_MOUNT);
    const root = isAsset ? testImagesDir : srcDir;
    const relative = isAsset
      ? requestPath.slice(ASSET_MOUNT.length)
      : requestPath.endsWith('/')
        ? `${requestPath}index.html`
        : requestPath;
    const filePath = path.join(root, relative);
    if (!filePath.startsWith(root)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    serveFile(res, filePath);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

function httpGetJson(port, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: urlPath, timeout: 2000 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

async function getFreePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

// ----------------------------------------------------------------- CDP client

function connectCdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    const pending = new Map();
    const listeners = new Map();
    let nextId = 1;

    socket.addEventListener('message', (event) => {
      const message = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString());
      if (message.id && pending.has(message.id)) {
        const { resolve: done, reject: fail } = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) fail(new Error(`${message.error.message} (${message.error.code})`));
        else done(message.result || {});
        return;
      }
      const handlers = listeners.get(message.method);
      if (handlers) handlers.forEach((handler) => handler(message.params || {}));
    });
    socket.addEventListener('error', () => reject(new Error(`Failed to connect to ${wsUrl}`)));
    socket.addEventListener('close', () => {
      pending.forEach(({ reject: fail }) => fail(new Error('DevTools connection closed')));
      pending.clear();
    });
    socket.addEventListener('open', () => {
      resolve({
        send(method, params = {}) {
          const id = nextId++;
          return new Promise((done, fail) => {
            pending.set(id, { resolve: done, reject: fail });
            socket.send(JSON.stringify({ id, method, params }));
          });
        },
        on(method, handler) {
          if (!listeners.has(method)) listeners.set(method, []);
          listeners.get(method).push(handler);
        },
        close() {
          socket.close();
        },
      });
    });
  });
}

// --------------------------------------------------------- PNG sanity checking

function decodePng(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buffer.subarray(0, 8).equals(signature)) throw new Error('not a PNG');

  let offset = 8;
  let header = null;
  const idat = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        interlace: data[12],
      };
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += length + 12;
  }
  if (!header || header.bitDepth !== 8 || header.interlace !== 0) {
    throw new Error('unsupported PNG layout');
  }
  const channels = { 2: 3, 6: 4 }[header.colorType];
  if (!channels) throw new Error(`unsupported PNG color type ${header.colorType}`);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = header.width * channels;
  const pixels = Buffer.alloc(header.height * stride);
  let pos = 0;
  for (let y = 0; y < header.height; y += 1) {
    const filter = raw[pos++];
    const row = raw.subarray(pos, pos + stride);
    pos += stride;
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x += 1) {
      const rawByte = row[x];
      const left = x >= channels ? out[x - channels] : 0;
      const up = prev ? prev[x] : 0;
      const upLeft = prev && x >= channels ? prev[x - channels] : 0;
      let value;
      if (filter === 0) value = rawByte;
      else if (filter === 1) value = rawByte + left;
      else if (filter === 2) value = rawByte + up;
      else if (filter === 3) value = rawByte + ((left + up) >> 1);
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        value = rawByte + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft);
      } else {
        throw new Error(`unsupported PNG filter ${filter}`);
      }
      out[x] = value & 0xff;
    }
  }
  return { header, channels, pixels };
}

function analyzePng(buffer) {
  const { header, channels, pixels } = decodePng(buffer);
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let i = 0; i < pixels.length; i += channels) {
    const luma = 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
    sum += luma;
    sumSq += luma * luma;
    count += 1;
  }
  const mean = sum / count;
  const deviation = Math.sqrt(Math.max(0, sumSq / count - mean * mean));
  return { width: header.width, height: header.height, mean, deviation };
}

// ------------------------------------------------------------------ CDP flow

// Captures every page of one viewport size into `outDir`.
async function captureSession({ chromePath, serverPort, outDir, viewport, withDrawer, withModals = false }) {
  fs.mkdirSync(outDir, { recursive: true });
  const debugPort = await getFreePort();
  const userDataDir = fs.mkdtempSync(path.join(process.env.TEMP || process.env.TMPDIR || '/tmp', 'anedikit-shots-'));

  const chrome = spawn(
    chromePath,
    [
      '--headless',
      `--remote-debugging-port=${debugPort}`,
      '--remote-allow-origins=*',
      `--user-data-dir=${userDataDir}`,
      `--window-size=${viewport.width},${viewport.height}`,
      '--hide-scrollbars',
      '--force-color-profile=srgb',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-networking',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  let chromeStderr = '';
  chrome.stderr.on('data', (chunk) => (chromeStderr += chunk.toString()));

  let cdp = null;
  try {
    const deadline = Date.now() + LAUNCH_TIMEOUT_MS;
    let target = null;
    while (!target && Date.now() < deadline) {
      try {
        const targets = await httpGetJson(debugPort, '/json/list');
        target = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl) || null;
      } catch {
        /* Chrome is still booting */
      }
      if (!target) await sleep(250);
    }
    if (!target) throw new Error(`Chrome never exposed a page target.\n${chromeStderr}`);

    cdp = await connectCdp(target.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    let emulatedHeight = viewport.height;
    const setViewportHeight = (height) =>
      cdp.send('Emulation.setDeviceMetricsOverride', {
        width: viewport.width,
        height,
        deviceScaleFactor: viewport.scale,
        mobile: false,
      });
    await setViewportHeight(emulatedHeight);

    const loaded = new Promise((resolve) => cdp.on('Page.loadEventFired', resolve));
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/index.html` });
    await Promise.race([loaded, sleep(15000)]);

    const evaluate = async (expression, awaitPromise = false) => {
      const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.exception?.description || 'evaluation failed');
      }
      return result.result.value;
    };
    const waitFor = async (expression, label, timeoutMs = 15000) => {
      const until = Date.now() + timeoutMs;
      while (Date.now() < until) {
        if (await evaluate(expression)) return;
        await sleep(150);
      }
      throw new Error(`Timed out waiting for ${label}`);
    };
    const capture = async (fileName) => {
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
      const buffer = Buffer.from(data, 'base64');
      fs.writeFileSync(path.join(outDir, fileName), buffer);
      return buffer;
    };
    // Grows the emulated viewport until the app's own scroll containers stop
    // overflowing, then reports how much was still cut off (0 when complete).
    const growToFit = async (measureExpr) => {
      const readRequired = (measurement) =>
        Math.round(typeof measurement === 'number' ? measurement : measurement?.required || 0);

      // Measured at the base viewport, before stretching hides the real content height.
      const initial = await evaluate(measureExpr);
      const required = readRequired(initial);
      let cutOff = Math.max(0, required - FULL_HEIGHT_CAP);
      if (required > emulatedHeight) {
        emulatedHeight = Math.min(FULL_HEIGHT_CAP, required);
        await setViewportHeight(emulatedHeight);
        // Give the app's resize listeners a frame to re-run their layout.
        await sleep(200);
      }
      // Growth can cascade (re-wrapping, stretching panels), so re-check a few times.
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const needed = readRequired(await evaluate(measureExpr));
        if (!needed || needed <= emulatedHeight + 1) break;
        cutOff = Math.max(0, needed - FULL_HEIGHT_CAP);
        emulatedHeight = Math.min(FULL_HEIGHT_CAP, needed);
        await setViewportHeight(emulatedHeight);
        await sleep(200);
      }
      return { height: emulatedHeight, cutOff, initial };
    };
    const resetViewportHeight = async () => {
      if (emulatedHeight === viewport.height) return;
      emulatedHeight = viewport.height;
      await setViewportHeight(emulatedHeight);
      await sleep(200);
    };
    const fitSuffix = ({ height, cutOff, initial }) => {
      const parts =
        initial && typeof initial === 'object' && initial.page !== undefined
          ? `, page ${Math.round(initial.page)}, nav ${Math.round(initial.nav)}`
          : '';
      const state = cutOff > 0 ? `${Math.round(cutOff)}px still cut off` : 'nothing cut off';
      return `full height ${height}px${parts}, ${state}`;
    };

    await waitFor('typeof window.switchAppTool === "function"', 'app boot');
    await waitFor('!!document.getElementById("tool-nav")', 'sidebar navigation');
    await evaluate('document.fonts ? document.fonts.ready.then(() => true) : true', true);
    await sleep(500);

    const pages = await evaluate(`(() => {
      const seen = new Set();
      const list = [];
      document.querySelectorAll('button[data-tool]').forEach((btn) => {
        const tool = btn.dataset.tool;
        if (seen.has(tool)) return;
        seen.add(tool);
        const label = btn.querySelector('span')?.textContent?.trim() || tool;
        list.push({ tool, label });
      });
      return list;
    })()`);
    const drawerTools = withDrawer ? new Set(DRAWER_TOOLS) : new Set();
    log(`Capturing ${pages.length} pages at ${viewport.width}x${viewport.height} (${viewport.scale}x)`);

    const results = [];
    const skipped = [];
    for (const { tool, label } of pages) {
      // User kits live behind the "enable user kits" setting and render a
      // scriptable IDE rather than a fixed page, so they are not documented here.
      if (tool.startsWith('kit_')) {
        skipped.push(tool);
        continue;
      }
      const base = slugify(label);
      await evaluate(`window.switchAppTool(${JSON.stringify(tool)})`);
      await waitFor(`!!document.querySelector('.tool-view:not(.d-none)')`, `${tool} view`);
      await evaluate('document.getElementById("tool-workspace").scrollTop = 0');
      await sleep(PAGE_SETTLE_MS);

      const headerTitle = await evaluate('document.getElementById("current-tool-title")?.textContent?.trim() || ""');
      const visibleView = await evaluate(`document.querySelector('.tool-view:not(.d-none)')?.id || ''`);
      // Narrow widths hide the sidebar behind the drawer, so a page capture must
      // never contain an open drawer.
      const drawerClosed = await evaluate(`(() => {
        const sidebar = document.getElementById('main-sidebar');
        return getComputedStyle(sidebar).visibility === 'hidden' && !sidebar.classList.contains('show-sidebar');
      })()`);
      // Docs captures are meant to show the empty state, so no media, URL,
      // or queue may have leaked in (a restored queue or a clipboard auto-paste).
      const emptyState = await evaluate(`(() => {
        const value = (id) => document.getElementById(id)?.value?.trim() || '';
        const count = (id) => parseInt(document.getElementById(id)?.textContent || '0', 10) || 0;
        return {
          input: value('input-file-path'),
          url: value('ytdlp-url-input'),
          batch: count('batch-queue-count'),
          images: count('image-ai-queue-count'),
        };
      })()`);
      const dirty = emptyState.input || emptyState.url || emptyState.batch || emptyState.images;
      const fit = await growToFit(PAGE_FIT_EXPR);
      const buffer = await capture(`${base}.png`);
      await resetViewportHeight();
      const stats = analyzePng(buffer);
      const expectedView = tool === 'all_tools' ? 'all-tools-browser' : tool.startsWith('pdf_') ? 'view-pdf' : `view-${tool}`;
      const blank =
        stats.deviation < 5 ||
        !headerTitle ||
        visibleView !== expectedView ||
        (withDrawer && !drawerClosed) ||
        !!dirty;
      if (dirty) log(`  not an empty state: ${JSON.stringify(emptyState)}`);
      results.push({ fileName: `${base}.png`, tool, view: visibleView, title: headerTitle, bytes: buffer.length, blank, ...stats });
      log(
        `  ${`${base}.png`.padEnd(30)} ${stats.width}x${stats.height}  ${(buffer.length / 1024).toFixed(0).padStart(4)} KB  ` +
          `sd ${stats.deviation.toFixed(1).padStart(4)}  ${visibleView.padEnd(22)} ${headerTitle}  ` +
          `(${fitSuffix(fit)})${blank ? '  <-- check this one!' : ''}`,
      );

      if (!drawerTools.has(tool)) continue;
      await evaluate('document.getElementById("btn-sidebar-toggle").click()');
      await waitFor(
        'document.getElementById("main-sidebar").classList.contains("show-sidebar")',
        `${tool} drawer`,
      );
      await sleep(PAGE_SETTLE_MS);
      const drawerFit = await growToFit(DRAWER_FIT_EXPR);
      const drawerBuffer = await capture(`${base}_drawer.png`);
      await resetViewportHeight();
      const drawerStats = analyzePng(drawerBuffer);
      const drawerVisible = await evaluate(`(() => {
        const sidebar = document.getElementById('main-sidebar');
        const rect = sidebar.getBoundingClientRect();
        return getComputedStyle(sidebar).visibility === 'visible' && rect.width > 200 && rect.height > 200;
      })()`);
      const drawerBlank = drawerStats.deviation < 5 || !drawerVisible || drawerFit.cutOff > 0;
      results.push({
        fileName: `${base}_drawer.png`,
        tool,
        view: visibleView,
        title: headerTitle,
        bytes: drawerBuffer.length,
        blank: drawerBlank,
        ...drawerStats,
      });
      log(
        `  ${`${base}_drawer.png`.padEnd(30)} ${drawerStats.width}x${drawerStats.height}  ` +
          `${(drawerBuffer.length / 1024).toFixed(0).padStart(4)} KB  sd ${drawerStats.deviation.toFixed(1).padStart(4)}  ` +
          `drawer open  (${fitSuffix(drawerFit)})${drawerBlank ? '  <-- check this one!' : ''}`,
      );
      // Closing through the backdrop also proves the dismiss target is clickable.
      await evaluate('document.getElementById("sidebar-backdrop").click()');
      await waitFor(
        '!document.getElementById("main-sidebar").classList.contains("show-sidebar")',
        `${tool} drawer close`,
      );
      await sleep(300);
    }

    if (withModals) {
      await evaluate('window.switchAppTool("convert")');
      await sleep(PAGE_SETTLE_MS);
      for (const modal of MODALS) {
        if (modal.setup) {
          await evaluate(modal.setup);
          await sleep(PAGE_SETTLE_MS);
        }
        await evaluate(modal.open);
        await waitFor(modal.isOpen, `${modal.label} open`);
        await sleep(PAGE_SETTLE_MS);
        const fit = await growToFit(MODAL_FIT_EXPR);
        await sleep(300);
        const verified = modal.verify ? await evaluate(modal.verify) : true;
        const buffer = await capture(modal.file);
        const stats = analyzePng(buffer);
        const blank = stats.deviation < 5 || !verified || fit.cutOff > 0;
        results.push({ fileName: modal.file, tool: 'modal', view: modal.label, title: '', bytes: buffer.length, blank, ...stats });
        log(
          `  ${modal.file.padEnd(38)} ${stats.width}x${stats.height}  ${(buffer.length / 1024).toFixed(0).padStart(4)} KB  ` +
            `sd ${stats.deviation.toFixed(1).padStart(4)}  ${modal.label}  (${fitSuffix(fit)})` +
            `${verified ? '' : '  <-- content missing!'}${blank ? '  <-- check this one!' : ''}`,
        );
        await evaluate(modal.close);
        await waitFor(modal.isClosed, `${modal.label} close`);
        await resetViewportHeight();
        await sleep(300);
      }
    }

    const blanks = results.filter((r) => r.blank);
    const unique = new Set(results.map((r) => r.fileName));
    log(`\nSaved ${results.length} screenshots to ${path.relative(rootDir, outDir)} (${unique.size} unique names)`);
    if (skipped.length) log(`Skipped user kit pages: ${skipped.join(', ')}`);
    if (blanks.length) {
      log(`WARNING: ${blanks.length} capture(s) look wrong or blank: ${blanks.map((b) => b.fileName).join(', ')}`);
      process.exitCode = 1;
    }
    return results;
  } finally {
    if (cdp) cdp.close();
    chrome.kill();
    await sleep(200);
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

async function main() {
  const readFlag = (name, fallback) => {
    const index = process.argv.indexOf(`--${name}`);
    return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
  };
  const mode = readFlag('mode', 'both');
  if (!['desktop', 'mobile', 'both'].includes(mode)) {
    throw new Error(`Unknown --mode "${mode}" (expected desktop, mobile, or both)`);
  }
  const version = readAppVersion();
  const outRoot = path.resolve(rootDir, readFlag('out', path.join('docs', 'screenshots', version)));
  const chromePath = findChromeExecutable();
  const { server, port } = await startStaticServer();
  log(`Serving ${path.relative(rootDir, srcDir)} on http://127.0.0.1:${port}`);

  try {
    if (mode === 'desktop' || mode === 'both') {
      log('\n[desktop]');
      await captureSession({
        chromePath,
        serverPort: port,
        outDir: outRoot,
        viewport: VIEWPORTS.desktop,
        withDrawer: false,
        withModals: true,
      });
    }
    if (mode === 'mobile' || mode === 'both') {
      log('\n[mobile]');
      await captureSession({
        chromePath,
        serverPort: port,
        outDir: path.join(outRoot, 'mobile'),
        viewport: VIEWPORTS.mobile,
        withDrawer: true,
      });
    }
  } finally {
    server.close();
  }
}

main().catch((err) => {
  log(`Screenshot capture failed: ${err.message}`);
  process.exitCode = 1;
});
