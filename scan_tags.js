import fs from 'node:fs';
import path from 'node:path';

function checkDir(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git') checkDir(p);
    } else if (entry.name.endsWith('.html')) {
      const lines = fs.readFileSync(p, 'utf8').split('\n');
      lines.forEach((line, idx) => {
        // Tag starts with <tag, and has an attribute closing quote that is immediately followed by a character other than space, >, /, or newline
        const m = line.match(/<[a-z0-9]+[^>]*"[a-zA-Z0-9_ -]+"[^>\s\/]/i);
        if (m) {
          console.log(`${p}:${idx + 1}: ${line.trim()}`);
        }
      });
    }
  }
}
checkDir('src');
