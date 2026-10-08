"use strict";
/**
 * Minimal structured logger.
 * In production you would swap this for Pino / Winston, but this avoids
 * adding extra dependencies while still producing machine-readable JSON.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const LEVEL_NUM = { debug: 0, info: 1, warn: 2, error: 3 };
function minLevel() {
    const env = (process.env.LOG_LEVEL || 'info').toLowerCase();
    return LEVEL_NUM[env] ?? LEVEL_NUM.info;
}
function log(level, msg, meta) {
    if (LEVEL_NUM[level] < minLevel())
        return;
    const entry = {
        ts: new Date().toISOString(),
        level,
        msg,
        ...meta,
    };
    const out = JSON.stringify(entry);
    if (level === 'error' || level === 'warn') {
        process.stderr.write(out + '\n');
    }
    else {
        process.stdout.write(out + '\n');
    }
}
exports.logger = {
    debug: (msg, meta) => log('debug', msg, meta),
    info: (msg, meta) => log('info', msg, meta),
    warn: (msg, meta) => log('warn', msg, meta),
    error: (msg, meta) => log('error', msg, meta),
};
