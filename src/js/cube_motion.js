// Small DOM adapter for cube-motion's four fixed motion jobs.
// The timings and curve mirror cube-motion; this keeps the app framework-free.
const EASE = "cubic-bezier(0.2, 0, 0, 1)";
const reduceMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || document.documentElement.classList.contains("no-animations");
const list = (targets, children = false) => {
  const nodes = typeof targets === "string" ? [...document.querySelectorAll(targets)] : targets instanceof Element ? [targets] : [...(targets || [])];
  return [...new Set(children ? nodes.flatMap((node) => [...node.children]) : nodes)];
};
const clear = (element) => element?.getAnimations?.().forEach((animation) => animation.cancel());
const current = (element) => {
  const style = getComputedStyle(element);
  return { opacity: style.opacity || "1", transform: style.transform === "none" ? "none" : style.transform, filter: style.filter || "none" };
};

export function rise(targets, { targets: scope = "self", stagger = 70, delay = 0 } = {}) {
  return list(targets, scope === "children").map((element, index) => {
    clear(element);
    const from = reduceMotion() ? { opacity: 0 } : { opacity: 0, transform: "translateY(12px)" };
    const to = reduceMotion() ? { opacity: 1 } : { opacity: 1, transform: "translateY(0)" };
    return element.animate([from, to], { duration: 640, delay: delay + index * stagger, easing: EASE, fill: "backwards" });
  });
}

export function leave(targets, { targets: scope = "self", stagger = 40, delay = 0 } = {}) {
  return list(targets, scope === "children").map((element, index) => {
    clear(element);
    return element.animate([current(element), reduceMotion() ? { opacity: 0 } : { opacity: 0, transform: "translateY(12px)" }], { duration: 320, delay: delay + index * stagger, easing: EASE, fill: "both" });
  });
}

export function morph(outgoing, incoming) {
  if (!outgoing || !incoming || outgoing === incoming) return [];
  const calm = reduceMotion();
  clear(outgoing); clear(incoming);
  const oldState = current(outgoing);
  const animations = [
    outgoing.animate([oldState, calm ? { opacity: 0 } : { opacity: 0, transform: "scale(.8)", filter: "blur(4px)" }], { duration: 220, easing: EASE, fill: "both" }),
    incoming.animate([calm ? { opacity: 0 } : { opacity: 0, transform: "scale(.8)", filter: "blur(4px)" }, { opacity: 1, transform: "scale(1)", filter: "blur(0)" }], { duration: 220, delay: calm ? 0 : 130, easing: EASE, fill: "both" }),
  ];
  animations.forEach((animation) => void animation.finished.catch(() => {}));
  return animations;
}

export function reveal(targets, { targets: scope = "self", stagger = 60, root = null } = {}) {
  const elements = list(targets, scope === "children");
  let observer;
  const show = (element, index) => rise(element, { delay: index * stagger });
  if (typeof IntersectionObserver === "undefined") elements.forEach(show);
  else {
    observer = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) { const index = elements.indexOf(entry.target); show(entry.target, index); observer.unobserve(entry.target); } }), { root, rootMargin: "0px 0px -10% 0px" });
    elements.forEach((element) => { element.style.opacity = "0"; observer.observe(element); });
  }
  return () => observer?.disconnect();
}

// Crossfade arbitrary button content while retaining the button/listener.
export function morphContent(container, html) {
  if (!container) return;
  if (container._cubeMotionHtml === html) return;
  container._cubeMotionHtml = html;
  if (typeof container.append !== "function" || typeof document === "undefined" || typeof document.createElement !== "function") {
    container.innerHTML = html;
    return;
  }
  const outgoing = document.createElement("span");
  const incoming = document.createElement("span");
  outgoing.className = incoming.className = "cube-motion-face d-inline-flex align-items-center gap-1";
  while (container.firstChild) outgoing.appendChild(container.firstChild);
  incoming.innerHTML = html;
  container.append(outgoing, incoming);
  const animations = morph(outgoing, incoming);
  Promise.all(animations.map((animation) => animation.finished.catch(() => {}))).then(() => {
    if (!container.isConnected) return;
    container.innerHTML = html;
  });
}
