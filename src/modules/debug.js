export const DebugModule = (() => {
  'use strict';

  const MAX_LOG_ENTRIES = 200;
  const logBuffer = [];

  function log(level, scope, err) {
    const entry = {
      time: new Date().toISOString(),
      level,
      scope,
      message: err && err.message ? err.message : String(err),
      stack: err && err.stack ? err.stack : null,
    };
    logBuffer.push(entry);
    if (logBuffer.length > MAX_LOG_ENTRIES) logBuffer.shift();

    const consoleFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    consoleFn(`[${scope}]`, err);
  }

  function getLog() {
    return [...logBuffer];
  }

  return { log, getLog };
})();
