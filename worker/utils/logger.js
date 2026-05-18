const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

export function createLogger(scope = 'iptvx', minLevel = 'info') {
  const min = LEVELS[minLevel] ?? 1;

  const log = (level, message, meta) => {
    if ((LEVELS[level] ?? 1) < min) return;
    const line = meta
      ? `[${scope}] ${level.toUpperCase()}: ${message} ${JSON.stringify(meta)}`
      : `[${scope}] ${level.toUpperCase()}: ${message}`;
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  };

  return {
    debug: (msg, meta) => log('debug', msg, meta),
    info: (msg, meta) => log('info', msg, meta),
    warn: (msg, meta) => log('warn', msg, meta),
    error: (msg, meta) => log('error', msg, meta),
  };
}
