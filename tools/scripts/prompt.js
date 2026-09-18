// Shared stdin line prompter for interactive tool scripts.
// (Avoids readline multi-question stalls on piped input.)
// input/output injectable for testing; defaults to process stdio.
export function createPrompter(input = process.stdin, output = process.stdout) {
  const pending = [];
  let buffer = '';
  let ended = false;
  let notify = null;

  const onData = (chunk) => {
    buffer += chunk.toString();
    let idx;
    const lines = [];
    while ((idx = buffer.indexOf('\n')) >= 0) {
      lines.push(buffer.slice(0, idx).replace(/\r$/, ''));
      buffer = buffer.slice(idx + 1);
    }
    if (lines.length > 0) {
      pending.push(...lines);
      if (notify) {
        const cb = notify;
        notify = null;
        cb();
      }
    }
  };
  const onEnd = () => {
    ended = true;
    if (pending.length === 0) pending.push('');
    if (notify) {
      const cb = notify;
      notify = null;
      cb();
    }
  };

  input.on('data', onData);
  input.on('end', onEnd);

  const ask = (question) =>
    new Promise((resolve) => {
      output.write(question);
      const take = () => {
        if (pending.length > 0) {
          resolve(pending.shift());
        } else if (ended) {
          resolve('');
        } else {
          notify = take;
        }
      };
      take();
    });

  const close = () => {
    input.off('data', onData);
    input.off('end', onEnd);
    if (typeof input.pause === 'function') {
      try {
        input.pause();
      } catch {
        // Non-pausable stream; ignore
      }
    }
  };

  return { ask, close };
}
