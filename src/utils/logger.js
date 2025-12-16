/**
 * Simple logger with color support
 */

import fs from 'fs';
import path from 'path';
import { LOGS_DIR, ensureDir, loadSettings } from './paths.js';

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

// Log levels
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  SILENT: 4
};

/**
 * Get current log level from settings
 */
function getCurrentLogLevel() {
  const settings = loadSettings();
  return LOG_LEVELS[settings.LOG_LEVEL] ?? LOG_LEVELS.INFO;
}

/**
 * Get current timestamp string
 */
function timestamp() {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

/**
 * Format log message
 */
function formatMessage(level, module, message, meta = {}) {
  const ts = timestamp();
  const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
  return `[${ts}] [${level}] [${module}] ${message}${metaStr}`;
}

/**
 * Write to log file
 */
function writeToFile(message) {
  try {
    ensureDir(LOGS_DIR);
    const today = new Date().toISOString().split('T')[0];
    const logFile = path.join(LOGS_DIR, `worker-${today}.log`);
    fs.appendFileSync(logFile, message + '\n');
  } catch {
    // Ignore file write errors
  }
}

/**
 * Logger object with methods for each level
 */
export const logger = {
  debug(module, message, meta = {}) {
    if (getCurrentLogLevel() > LOG_LEVELS.DEBUG) return;
    const msg = formatMessage('DEBUG', module, message, meta);
    console.log(`${colors.gray}${msg}${colors.reset}`);
    writeToFile(msg);
  },

  info(module, message, meta = {}) {
    if (getCurrentLogLevel() > LOG_LEVELS.INFO) return;
    const msg = formatMessage('INFO', module, message, meta);
    console.log(`${colors.blue}${msg}${colors.reset}`);
    writeToFile(msg);
  },

  success(module, message, meta = {}) {
    if (getCurrentLogLevel() > LOG_LEVELS.INFO) return;
    const msg = formatMessage('SUCCESS', module, message, meta);
    console.log(`${colors.green}${msg}${colors.reset}`);
    writeToFile(msg);
  },

  warn(module, message, meta = {}) {
    if (getCurrentLogLevel() > LOG_LEVELS.WARN) return;
    const msg = formatMessage('WARN', module, message, meta);
    console.log(`${colors.yellow}${msg}${colors.reset}`);
    writeToFile(msg);
  },

  error(module, message, meta = {}, error = null) {
    if (getCurrentLogLevel() > LOG_LEVELS.ERROR) return;
    const errorMeta = error ? { ...meta, error: error.message, stack: error.stack } : meta;
    const msg = formatMessage('ERROR', module, message, errorMeta);
    console.error(`${colors.red}${msg}${colors.reset}`);
    writeToFile(msg);
  },

  dataIn(module, message, meta = {}) {
    if (getCurrentLogLevel() > LOG_LEVELS.DEBUG) return;
    const msg = formatMessage('DATA_IN', module, message, meta);
    console.log(`${colors.cyan}${msg}${colors.reset}`);
    writeToFile(msg);
  },

  dataOut(module, message, meta = {}) {
    if (getCurrentLogLevel() > LOG_LEVELS.DEBUG) return;
    const msg = formatMessage('DATA_OUT', module, message, meta);
    console.log(`${colors.magenta}${msg}${colors.reset}`);
    writeToFile(msg);
  }
};

