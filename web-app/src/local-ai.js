// One inference job at a time; superseded work is terminated to protect mobile CPUs.
let active;
export function rankOnDevice(seeds, candidates, signal, status = () => {}) {
  active?.();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Cancelled'));
    const worker = new Worker(new URL('./local-ai-worker.js', import.meta.url), { type: 'module' });
    let settled = false;
    const finish = (error, ids) => { if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', cancel); worker.terminate(); if (active === cancel) active = null; error ? reject(error) : resolve(ids); };
    const cancel = () => finish(new Error('Cancelled'));
    const timer = setTimeout(() => finish(new Error('On-device AI timed out')), 90000);
    active = cancel; signal?.addEventListener('abort', cancel, { once: true });
    worker.onerror = () => finish(new Error('On-device AI is unavailable'));
    worker.onmessage = ({ data }) => { if (data.type === 'result') { status('ready'); finish(null, data.ids); } else if (data.type === 'error') finish(new Error(data.error)); else status('loading', data.progress); };
    status('loading'); worker.postMessage({ seeds, candidates });
  });
}
