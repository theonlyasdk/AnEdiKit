// AnEdiKit - Lightweight UI State Management & Persistence Library
// Manages reactive, persistent UI state across page reloads and view changes.

class MemoryStorageAdapter {
  constructor() {
    this._data = new Map();
  }
  getItem(key) {
    return this._data.has(key) ? this._data.get(key) : null;
  }
  setItem(key, value) {
    this._data.set(key, String(value));
  }
  removeItem(key) {
    this._data.delete(key);
  }
  clear() {
    this._data.clear();
  }
  get length() {
    return this._data.size;
  }
  key(index) {
    return Array.from(this._data.keys())[index] || null;
  }
}

function resolveStorageBackend(storageOption) {
  if (storageOption && typeof storageOption.getItem === "function" && typeof storageOption.setItem === "function") {
    return storageOption;
  }
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const testKey = "__ui_state_test__";
      window.localStorage.setItem(testKey, "1");
      window.localStorage.removeItem(testKey);
      return window.localStorage;
    }
  } catch (_) {
    // LocalStorage not available or blocked
  }
  return new MemoryStorageAdapter();
}

export class UIStateManager {
  constructor(options = {}) {
    this.namespace = options.namespace !== undefined ? options.namespace : "anedikit:ui:";
    this.storage = resolveStorageBackend(options.storage);
    this.debounceDefaultMs = options.debounceDefaultMs !== undefined ? options.debounceDefaultMs : 100;
    this._listeners = new Map(); // key -> Set<Function>
    this._wildcardListeners = new Set(); // Set<Function>
    this._bindings = new Map(); // key -> Set<BindingHandle>
    this._debounceTimers = new Map();
  }

  _formatKey(key) {
    if (!key) return this.namespace;
    return key.startsWith(this.namespace) ? key : `${this.namespace}${key}`;
  }

  _stripNamespace(prefixedKey) {
    return prefixedKey.startsWith(this.namespace)
      ? prefixedKey.slice(this.namespace.length)
      : prefixedKey;
  }

  /**
   * Retrieve a value from persistent state.
   * @template T
   * @param {string} key
   * @param {T} [defaultValue]
   * @returns {T}
   */
  get(key, defaultValue = undefined) {
    const raw = this.storage.getItem(this._formatKey(key));
    if (raw === null || raw === undefined) {
      return defaultValue;
    }
    try {
      return JSON.parse(raw);
    } catch (_) {
      return raw;
    }
  }

  /**
   * Set and persist a value to state. Notifies subscribers.
   * @param {string} key
   * @param {*} value
   * @param {object} [options]
   * @param {boolean} [options.silent=false]
   * @param {number} [options.debounceMs=0]
   */
  set(key, value, options = {}) {
    const { silent = false, debounceMs = 0 } = options;
    const fullKey = this._formatKey(key);
    const cleanKey = this._stripNamespace(fullKey);

    const performWrite = () => {
      const oldValue = this.get(cleanKey);
      try {
        if (value === undefined) {
          this.storage.removeItem(fullKey);
        } else {
          this.storage.setItem(fullKey, JSON.stringify(value));
        }
      } catch (err) {
        console.warn(`[UIState] Failed to persist key "${cleanKey}":`, err);
      }

      if (!silent) {
        this._notify(cleanKey, value, oldValue);
      }
    };

    if (debounceMs > 0) {
      if (this._debounceTimers.has(fullKey)) {
        clearTimeout(this._debounceTimers.get(fullKey));
      }
      const timer = setTimeout(() => {
        this._debounceTimers.delete(fullKey);
        performWrite();
      }, debounceMs);
      this._debounceTimers.set(fullKey, timer);
    } else {
      performWrite();
    }
  }

  /**
   * Update state using an updater function: (prev) => next
   * @param {string} key
   * @param {Function} updaterFn
   * @param {*} [defaultValue]
   */
  update(key, updaterFn, defaultValue = undefined) {
    const current = this.get(key, defaultValue);
    const next = updaterFn(current);
    this.set(key, next);
    return next;
  }

  /**
   * Remove a key from state and storage.
   * @param {string} key
   */
  remove(key) {
    const fullKey = this._formatKey(key);
    const cleanKey = this._stripNamespace(fullKey);
    const oldValue = this.get(cleanKey);
    try {
      this.storage.removeItem(fullKey);
    } catch (err) {
      console.warn(`[UIState] Failed to remove key "${cleanKey}":`, err);
    }
    this._notify(cleanKey, undefined, oldValue);
  }

  /**
   * Check if a key exists in state.
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    return this.storage.getItem(this._formatKey(key)) !== null;
  }

  /**
   * Clear all keys in this namespace, or matching an optional sub-prefix.
   * @param {string} [prefix]
   */
  clear(prefix = "") {
    const fullPrefix = this._formatKey(prefix);
    const keysToRemove = [];

    // LocalStorage or memory iteration
    const len = this.storage.length || 0;
    for (let i = 0; i < len; i++) {
      const k = this.storage.key(i);
      if (k && k.startsWith(fullPrefix)) {
        keysToRemove.push(k);
      }
    }

    for (const k of keysToRemove) {
      const cleanKey = this._stripNamespace(k);
      const oldValue = this.get(cleanKey);
      try {
        this.storage.removeItem(k);
      } catch (_) {}
      this._notify(cleanKey, undefined, oldValue);
    }
  }

  /**
   * Get an object mapping containing all key/value pairs in the current namespace (or sub-prefix).
   * @param {string} [prefix=""]
   * @returns {Record<string, *>}
   */
  getAll(prefix = "") {
    const fullPrefix = this._formatKey(prefix);
    const result = {};
    const len = this.storage.length || 0;
    for (let i = 0; i < len; i++) {
      const k = this.storage.key(i);
      if (k && k.startsWith(fullPrefix)) {
        const cleanKey = this._stripNamespace(k);
        result[cleanKey] = this.get(cleanKey);
      }
    }
    return result;
  }

  /**
   * Subscribe to changes on a key or all keys ("*").
   * @param {string} keyOrWildcard
   * @param {Function} callback (newValue, oldValue, key) => void
   * @returns {Function} unsubscribe function
   */
  subscribe(keyOrWildcard, callback) {
    if (typeof callback !== "function") return () => {};

    if (keyOrWildcard === "*") {
      this._wildcardListeners.add(callback);
      return () => {
        this._wildcardListeners.delete(callback);
      };
    }

    const cleanKey = this._stripNamespace(this._formatKey(keyOrWildcard));
    if (!this._listeners.has(cleanKey)) {
      this._listeners.set(cleanKey, new Set());
    }
    const set = this._listeners.get(cleanKey);
    set.add(callback);

    return () => {
      set.delete(callback);
      if (set.size === 0) {
        this._listeners.delete(cleanKey);
      }
    };
  }

  _notify(cleanKey, newValue, oldValue) {
    const listeners = this._listeners.get(cleanKey);
    if (listeners) {
      listeners.forEach((fn) => {
        try {
          fn(newValue, oldValue, cleanKey);
        } catch (err) {
          console.error(`[UIState] Error in listener for "${cleanKey}":`, err);
        }
      });
    }

    this._wildcardListeners.forEach((fn) => {
      try {
        fn(newValue, oldValue, cleanKey);
      } catch (err) {
        console.error(`[UIState] Error in wildcard listener for "${cleanKey}":`, err);
      }
    });
  }

  /**
   * Binds a DOM element (input, select, textarea, checkbox, range) to a state key with auto-persistence and reload restore.
   * @param {HTMLElement|string} elementOrSelector
   * @param {string} key
   * @param {object} [options]
   * @returns {{ unbind: Function, get: Function, set: Function }}
   */
  bind(elementOrSelector, key, options = {}) {
    const el = typeof elementOrSelector === "string"
      ? (typeof document !== "undefined" ? document.querySelector(elementOrSelector) : null)
      : elementOrSelector;

    if (!el) {
      return { unbind: () => {}, get: () => this.get(key), set: (val) => this.set(key, val) };
    }

    const {
      defaultValue,
      debounceMs = (el.type === "checkbox" || el.type === "radio" || el.tagName === "SELECT") ? 0 : this.debounceDefaultMs,
      serializer = null,
      deserializer = null,
      onChange = null,
      syncOnSubscribe = true,
      eventName = (el.type === "checkbox" || el.type === "radio" || el.tagName === "SELECT") ? "change" : "input",
    } = options;

    const readFromElement = () => {
      let val;
      if (el.type === "checkbox") {
        val = el.checked;
      } else if (el.type === "radio") {
        val = el.checked ? el.value : undefined;
      } else if (el.type === "number" || el.type === "range") {
        val = el.value === "" ? "" : Number(el.value);
        if (Number.isNaN(val)) val = el.value;
      } else {
        val = el.value;
      }
      return serializer ? serializer(val, el) : val;
    };

    const writeToElement = (val) => {
      const formatted = deserializer ? deserializer(val, el) : val;
      if (formatted === undefined || formatted === null) return;

      if (el.type === "checkbox") {
        el.checked = Boolean(formatted);
      } else if (el.type === "radio") {
        el.checked = String(formatted) === String(el.value);
      } else {
        el.value = String(formatted);
      }
    };

    // 1. Initial State Restore
    const existing = this.get(key);
    if (existing !== undefined) {
      writeToElement(existing);
    } else if (defaultValue !== undefined) {
      this.set(key, defaultValue, { silent: true });
      writeToElement(defaultValue);
    } else {
      // Initialize state from current DOM element value
      const initialDomVal = readFromElement();
      if (initialDomVal !== undefined && initialDomVal !== "") {
        this.set(key, initialDomVal, { silent: true });
      }
    }

    // 2. DOM Event Listener
    const onDOMEvent = () => {
      const currentVal = readFromElement();
      if (currentVal !== undefined) {
        this.set(key, currentVal, { debounceMs });
        if (typeof onChange === "function") {
          onChange(currentVal, el);
        }
      }
    };

    el.addEventListener(eventName, onDOMEvent);
    if (eventName === "input" && (el.type === "range" || el.tagName === "INPUT")) {
      // Also bind change event to ensure blur/final commit
      el.addEventListener("change", onDOMEvent);
    }

    // 3. State Subscription (external updates update DOM)
    let unsubscribe = null;
    if (syncOnSubscribe) {
      unsubscribe = this.subscribe(key, (newVal) => {
        const domVal = readFromElement();
        if (newVal !== domVal && newVal !== undefined) {
          writeToElement(newVal);
          if (typeof onChange === "function") {
            onChange(newVal, el);
          }
        }
      });
    }

    const unbind = () => {
      el.removeEventListener(eventName, onDOMEvent);
      if (eventName === "input") {
        el.removeEventListener("change", onDOMEvent);
      }
      if (unsubscribe) {
        unsubscribe();
      }
    };

    return {
      unbind,
      get: () => this.get(key),
      set: (val) => this.set(key, val),
    };
  }

  /**
   * Automatically scans a container for inputs with data-ui-state, id, or name attributes and binds them.
   * @param {HTMLElement|string} containerOrSelector
   * @param {object} [options]
   */
  bindContainer(containerOrSelector, options = {}) {
    const container = typeof containerOrSelector === "string"
      ? (typeof document !== "undefined" ? document.querySelector(containerOrSelector) : null)
      : containerOrSelector;

    if (!container) return { unbind: () => {}, handles: [] };

    const prefix = options.prefix || "";
    const handles = [];
    const elements = container.querySelectorAll("input, select, textarea");

    elements.forEach((el) => {
      const stateKey = el.getAttribute("data-ui-state") || el.id || el.name;
      if (!stateKey) return;
      const key = prefix ? `${prefix}:${stateKey}` : stateKey;
      const handle = this.bind(el, key, options);
      handles.push(handle);
    });

    return {
      handles,
      unbind: () => handles.forEach((h) => h.unbind()),
    };
  }

  /**
   * Scans document (or given root element) and automatically binds all elements with `data-ui-state`.
   * @param {HTMLElement|Document} [root]
   * @returns {Array<{ unbind: Function }>}
   */
  initAutoState(root = (typeof document !== "undefined" ? document : null)) {
    if (!root) return [];
    const handles = [];
    const elements = root.querySelectorAll("[data-ui-state]");

    elements.forEach((el) => {
      const key = el.getAttribute("data-ui-state");
      if (!key) return;

      const groupEl = el.closest("[data-ui-state-group]");
      const groupPrefix = groupEl ? groupEl.getAttribute("data-ui-state-group") : "";
      const fullKey = groupPrefix ? `${groupPrefix}:${key}` : key;

      const debounceAttr = el.getAttribute("data-ui-debounce");
      const debounceMs = debounceAttr !== null ? Number(debounceAttr) : undefined;

      const handle = this.bind(el, fullKey, { debounceMs });
      handles.push(handle);
    });

    return handles;
  }
}

// Global Singleton Instance
export const uiState = new UIStateManager();

// Factory for custom instances / isolated state stores
export function createUIStore(namespace, storageAdapter) {
  return new UIStateManager({ namespace, storage: storageAdapter });
}
