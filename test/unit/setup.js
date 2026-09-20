// Setup DOM and browser globals before any module imports
class MockClassList {
  constructor() {
    this._classes = new Set();
  }
  add(...cls) {
    cls.forEach((c) => this._classes.add(c));
  }
  remove(...cls) {
    cls.forEach((c) => this._classes.delete(c));
  }
  toggle(cls, force) {
    if (force !== undefined) {
      if (force) this._classes.add(cls);
      else this._classes.delete(cls);
      return force;
    }
    if (this._classes.has(cls)) {
      this._classes.delete(cls);
      return false;
    }
    this._classes.add(cls);
    return true;
  }
  contains(cls) {
    return this._classes.has(cls);
  }
}

// Minimal CSSStyleDeclaration stand-in: supports setProperty/getPropertyValue
// plus plain property assignment (`el.style.color = ...`).
class MockStyle {
  constructor() {
    this._props = new Map();
  }
  setProperty(name, value) {
    this._props.set(String(name), String(value));
  }
  getPropertyValue(name) {
    const key = String(name);
    return this._props.has(key) ? this._props.get(key) : "";
  }
  removeProperty(name) {
    const key = String(name);
    const value = this.getPropertyValue(key);
    this._props.delete(key);
    return value;
  }
}

class MockElement {
  constructor(tag = "div", id = "") {
    this.tagName = tag.toUpperCase();
    this.id = id;
    this.classList = new MockClassList();
    this.dataset = {};
    this.children = [];
    this.parentElement = null;
    this._value = "";
    this.checked = false;
    this.textContent = "";
    this.innerHTML = "";
    this.style = new MockStyle();
    this.clientWidth = 200;
    this._attributes = {};
    this._listeners = new Map();
  }
  get isConnected() {
    return true;
  }
  closest(sel) {
    if (this.parentElement) {
      return this.parentElement;
    }
    return null;
  }
  get value() {
    return this._value;
  }
  set value(v) {
    this._value = String(v);
  }
  setAttribute(k, v) {
    this._attributes[k] = String(v);
  }
  getAttribute(k) {
    return this._attributes[k] ?? null;
  }
  removeAttribute(k) {
    delete this._attributes[k];
  }
  querySelector(sel) {
    return this.children.find((c) => c.tagName === sel.toUpperCase()) || null;
  }
  querySelectorAll(sel) {
    const parts = sel.split(",").map((s) => s.trim().toUpperCase());
    return this.children.filter((c) => parts.includes(c.tagName) || (c.classList && parts.some((s) => s.startsWith(".") && c.classList.contains(s.slice(1).toLowerCase()))));
  }
  appendChild(child) {
    if (child) child.parentElement = this;
    this.children.push(child);
    return child;
  }
  insertBefore(child) {
    if (child) child.parentElement = this;
    this.children.push(child);
    return child;
  }
  removeChild(child) {
    const i = this.children.indexOf(child);
    if (i !== -1) {
      this.children.splice(i, 1);
      if (child) child.parentElement = null;
    }
    return child;
  }
  click() {
    if (this.onclick) this.onclick({ target: this, preventDefault: () => {} });
    this.dispatchEvent({ type: "click", target: this, preventDefault: () => {} });
  }
  remove() {}
  // Media element no-ops (video/audio previews call these during teardown).
  pause() {}
  play() {
    return Promise.resolve();
  }
  load() {}
  addEventListener(evt, fn) {
    if (!this._listeners.has(evt)) this._listeners.set(evt, []);
    this._listeners.get(evt).push(fn);
  }
  removeEventListener(evt, fn) {
    if (!this._listeners.has(evt)) return;
    this._listeners.set(
      evt,
      this._listeners.get(evt).filter((cb) => cb !== fn)
    );
  }
  dispatchEvent(evt) {
    const type = typeof evt === "string" ? evt : evt?.type;
    if (type && this._listeners.has(type)) {
      const listeners = [...this._listeners.get(type)];
      for (const fn of listeners) {
        fn(evt);
      }
    }
    return true;
  }
}

class MockDocument {
  constructor() {
    this.elements = new Map();
    this.body = new MockElement("body", "body");
    this.documentElement = new MockElement("html", "html");
    this._listeners = new Map();
  }
  getElementById(id) {
    if (!this.elements.has(id)) {
      this.elements.set(id, new MockElement("div", id));
    }
    return this.elements.get(id);
  }
  querySelector(sel) {
    if (sel.startsWith("#")) return this.getElementById(sel.slice(1));
    return null;
  }
  querySelectorAll(sel) {
    return [];
  }
  createElement(tag) {
    return new MockElement(tag);
  }
  addEventListener(evt, fn) {
    if (!this._listeners.has(evt)) this._listeners.set(evt, []);
    this._listeners.get(evt).push(fn);
  }
  removeEventListener(evt, fn) {
    if (!this._listeners.has(evt)) return;
    this._listeners.set(
      evt,
      this._listeners.get(evt).filter((cb) => cb !== fn)
    );
  }
  dispatchEvent(evt) {
    const type = typeof evt === "string" ? evt : evt?.type;
    if (type && this._listeners.has(type)) {
      const listeners = [...this._listeners.get(type)];
      for (const fn of listeners) {
        fn(evt);
      }
    }
    return true;
  }
}

const mockDoc = new MockDocument();
globalThis.document = mockDoc;
globalThis.window = {
  document: mockDoc,
  addEventListener: () => {},
  removeEventListener: () => {},
  navigator: { clipboard: { writeText: async () => {}, readText: async () => "" } },
  __TAURI__: null,
  CSS: { supports: () => true },
};
try {
  Object.defineProperty(globalThis, "navigator", {
    value: globalThis.window.navigator,
    configurable: true,
    writable: true,
  });
} catch (_) {}
// Minimal computed-style stub: transitions/animations read a handful of
// properties and getPropertyValue() results.
globalThis.getComputedStyle = () => ({
  borderRadius: "0px",
  backgroundColor: "",
  getPropertyValue: () => "",
});
globalThis.window.getComputedStyle = globalThis.getComputedStyle;

// Animation-frame stubs: modules use rAF to defer visual state changes.
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.window.requestAnimationFrame = globalThis.requestAnimationFrame;
globalThis.window.cancelAnimationFrame = globalThis.cancelAnimationFrame;

globalThis.localStorage = {
  _store: {},
  getItem(k) {
    return this._store[k] ?? null;
  },
  setItem(k, v) {
    this._store[k] = String(v);
  },
  removeItem(k) {
    delete this._store[k];
  },
  clear() {
    this._store = {};
  },
};
