// Material 3 Range Slider Helper Module
// Computes and dynamically binds real-time --range-progress for Material 3 fill & gap styling

export function syncM3Slider(rangeEl) {
  if (!rangeEl || typeof rangeEl.getAttribute !== "function") return;
  if (rangeEl.classList && rangeEl.classList.contains("trim-range-slider")) return;

  const minStr = rangeEl.getAttribute("min");
  const maxStr = rangeEl.getAttribute("max");
  const valStr = rangeEl.value;

  const min = minStr !== null && minStr !== "" ? parseFloat(minStr) : 0;
  const max = maxStr !== null && maxStr !== "" ? parseFloat(maxStr) : 100;
  const val = valStr !== "" ? parseFloat(valStr) : (min + max) / 2;

  let pct = 50;
  if (max > min && !isNaN(val)) {
    pct = Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100));
  }

  rangeEl.style.setProperty("--range-progress", `${pct.toFixed(2)}%`);
}

export function bindM3Slider(rangeEl) {
  if (!rangeEl || rangeEl._m3SliderBound) return;
  if (rangeEl.classList && rangeEl.classList.contains("trim-range-slider")) return;
  rangeEl._m3SliderBound = true;

  syncM3Slider(rangeEl);

  const onUpdate = () => syncM3Slider(rangeEl);
  rangeEl.addEventListener("input", onUpdate, { passive: true });
  rangeEl.addEventListener("change", onUpdate, { passive: true });
}

export function initM3Sliders(root = (typeof document !== "undefined" ? document : null)) {
  if (!root || typeof root.querySelectorAll !== "function") return;

  const sliders = root.querySelectorAll('.form-range:not(.trim-range-slider), input[type="range"]:not(.trim-range-slider)');
  sliders.forEach(bindM3Slider);

  // Set up global input listener and MutationObserver for dynamically added sliders
  if (root === document && typeof window !== "undefined" && !window._m3SliderObserverInitialized) {
    window._m3SliderObserverInitialized = true;

    // Delegated input listener ensures any newly mounted slider updates immediately on touch/drag
    document.addEventListener("input", (e) => {
      const target = e.target;
      if (target && target.tagName === "INPUT" && target.type === "range") {
        syncM3Slider(target);
      }
    }, { passive: true, capture: true });

    document.addEventListener("change", (e) => {
      const target = e.target;
      if (target && target.tagName === "INPUT" && target.type === "range") {
        syncM3Slider(target);
      }
    }, { passive: true, capture: true });

    if (typeof MutationObserver !== "undefined" && document.body) {
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === "childList") {
            for (const node of mutation.addedNodes) {
              if (node.nodeType === 1) { // Node.ELEMENT_NODE
                if (node.matches && (node.matches('.form-range:not(.trim-range-slider)') || node.matches('input[type="range"]:not(.trim-range-slider)'))) {
                  bindM3Slider(node);
                }
                const nested = node.querySelectorAll ? node.querySelectorAll('.form-range:not(.trim-range-slider), input[type="range"]:not(.trim-range-slider)') : [];
                nested.forEach(bindM3Slider);
              }
            }
          }
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }
}
