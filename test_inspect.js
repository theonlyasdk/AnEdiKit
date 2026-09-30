import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const server = http.createServer((req, res) => {
  let reqPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  let p = path.join(__dirname, 'src', reqPath === '/' ? 'index.html' : reqPath);
  if (fs.existsSync(p) && fs.statSync(p).isFile()) {
    const ext = path.extname(p);
    const mimes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
    res.writeHead(200, { 'Content-Type': mimes[ext] || 'text/plain' });
    res.end(fs.readFileSync(p));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(0, '127.0.0.1', async () => {
  const port = server.address().port;
  const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const chrome = spawn(chromePath, ['--headless', '--remote-debugging-port=9222', 'http://127.0.0.1:' + port + '/']);
  
  setTimeout(async () => {
    try {
      http.get('http://127.0.0.1:9222/json', (r) => {
        let d = '';
        r.on('data', c => d += c);
        r.on('end', async () => {
          const tabs = JSON.parse(d);
          const tab = tabs.find(t => t.type === 'page');
          if (tab) {
            const ws = new WebSocket(tab.webSocketDebuggerUrl);
            let msgId = 1;
            const send = (method, params={}) => new Promise(resolve => {
              const id = msgId++;
              const onMsg = (event) => {
                const data = JSON.parse(event.data);
                if (data.id === id) {
                  ws.removeEventListener('message', onMsg);
                  resolve(data.result);
                }
              };
              ws.addEventListener('message', onMsg);
              ws.send(JSON.stringify({id, method, params}));
            });

            ws.onopen = async () => {
              await send('Runtime.enable');
              await new Promise(r => setTimeout(r, 1000));
              const evalRes = await send('Runtime.evaluate', {
                expression: `(() => {
                  const sc = document.getElementById("shared-input-card");
                  return Array.from(sc.children).map(c => ({ tag: c.tagName, id: c.id, cls: c.className }));
                })()`,
                returnByValue: true
              });
              console.log('Children of shared-input-card:', evalRes.result.value);
              chrome.kill();
              server.close();
              process.exit(0);
              for (const tool of testTools) {
                const switchRes = await send('Runtime.evaluate', {
                  expression: `(() => {
                    window.switchAppTool("${tool}");
                    const activeTool = document.body.dataset.activeTool;
                    const visibleViews = Array.from(document.querySelectorAll('.tool-view:not(.d-none)')).map(v => v.id);
                    const toolViewContainer = document.getElementById('tool-view-container')?.className;
                    const sharedInput = document.getElementById('shared-input-card')?.className;
                    const sharedUrl = document.getElementById('shared-url-card')?.className;
                    const imageAi = document.getElementById('image-ai-workspace-card')?.className;
                    const targetView = document.getElementById(visibleViews[0]);
                    const elRect = (el) => {
                      if (!el) return null;
                      const r = el.getBoundingClientRect();
                      const cs = window.getComputedStyle(el);
                      return { w: r.width, h: r.height, display: cs.display, vis: cs.visibility, op: cs.opacity, pos: cs.position, overflow: cs.overflow };
                    };
                    const chain = [];
                    let cur = targetView;
                    while (cur && cur !== document.documentElement) {
                      chain.push({ tag: cur.tagName, id: cur.id, cls: cur.className, ...elRect(cur) });
                      cur = cur.parentElement;
                    }
                    return { requestedTool: "${tool}", chain };
                  })()`,
                  returnByValue: true
                });
                console.log('Tool test:', JSON.stringify(switchRes.result.value, null, 2));
              }

              chrome.kill();
              server.close();
              process.exit(0);
            };
          }
        });
      });
    } catch(e) {
      console.error(e);
      chrome.kill();
      server.close();
      process.exit(1);
    }
  }, 1000);
});
