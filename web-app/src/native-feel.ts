declare global {
  interface Window { ZonicNative?: { postMessage(message: string): void } }
}

const native = new URL(location.href).searchParams.get('native') === '1';
if (native) {
  document.documentElement.classList.add('native-shell');
  let lastTouch = 0;
  document.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch') lastTouch = performance.now();
  }, { passive: true });
  document.addEventListener('click', event => {
    if (performance.now() - lastTouch > 800) return;
    const target = event.target instanceof Element ? event.target.closest('button,a,[role="button"],select') : null;
    if (!target || target.matches(':disabled,[aria-disabled="true"]')) return;
    const message = target.matches('#play,.play-main,[data-play],.primary') ? 'medium' : 'selection';
    window.ZonicNative?.postMessage(message);
  }, { passive: true });
}

export {};
