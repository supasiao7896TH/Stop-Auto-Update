import { DebugModule } from './debug.js';

export const StateStore = (() => {
  'use strict';

  const state = {
    sections: [],
    employees: [],
    taskEntries: [],
    filterYear: new Date().getFullYear(),
    filterSectionId: null,
    geminiKeyConfigured: false,
  };

  const listeners = new Map(); // key -> Set<fn>

  function get(key) {
    return state[key];
  }

  function set(key, value) {
    state[key] = value;
    const subs = listeners.get(key);
    if (!subs) return;
    subs.forEach((fn) => {
      try {
        fn(value);
      } catch (err) {
        DebugModule.log('error', `StateStore.notify.${key}`, err);
      }
    });
  }

  function on(key, fn) {
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key).add(fn);
  }

  function off(key, fn) {
    listeners.get(key)?.delete(fn);
  }

  // Optimistic update: apply state immediately, persist async, roll back on failure.
  async function optimisticUpdate(key, nextValue, persistFn) {
    const prevValue = state[key];
    set(key, nextValue);
    try {
      await persistFn(nextValue);
      return nextValue;
    } catch (err) {
      DebugModule.log('error', `StateStore.optimisticUpdate.${key}`, err);
      set(key, prevValue);
      throw err;
    }
  }

  return { get, set, on, off, optimisticUpdate };
})();
