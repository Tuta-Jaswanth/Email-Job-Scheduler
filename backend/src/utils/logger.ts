/**
 * Minimal structured logger.
 * In production you would swap this for Pino / Winston, but this avoids
 * adding extra dependencies while still producing machine-readable JSON.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_NUM: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function minLevel(): number {
  const env = (process.env.LOG_LEVEL || 'info').toLowerCase() as Level;
  return LEVEL_NUM[env] ?? LEVEL_NUM.info;
}

function log(level: Level, msg: string, meta?: Record<string, unknown>): void {
  if (LEVEL_NUM[level] < minLevel()) return;

  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...meta,
  };

  const out = JSON.stringify(entry);
  if (level === 'error' || level === 'warn') {
    process.stderr.write(out + '\n');
  } else {
    process.stdout.write(out + '\n');
  }
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => log('debug', msg, meta),
  info:  (msg: string, meta?: Record<string, unknown>) => log('info',  msg, meta),
  warn:  (msg: string, meta?: Record<string, unknown>) => log('warn',  msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => log('error', msg, meta),
};
