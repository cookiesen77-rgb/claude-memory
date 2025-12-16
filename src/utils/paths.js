/**
 * Path utilities - all data storage locations
 */

import { homedir } from 'os';
import path from 'path';
import fs from 'fs';

// Data directory - ~/.claude-memory/
export const DATA_DIR = path.join(homedir(), '.claude-memory');

// Database path
export const DB_PATH = path.join(DATA_DIR, 'memory.db');

// Settings path
export const SETTINGS_PATH = path.join(DATA_DIR, 'settings.json');

// Logs directory
export const LOGS_DIR = path.join(DATA_DIR, 'logs');

// Default settings
export const DEFAULT_SETTINGS = {
  WORKER_PORT: 37779,
  WORKER_HOST: '127.0.0.1',
  CONTEXT_OBSERVATIONS: 50,
  LOG_LEVEL: 'INFO'
};

/**
 * Ensure directory exists
 */
export function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Load settings with defaults
 */
export function loadSettings() {
  ensureDir(DATA_DIR);
  
  if (fs.existsSync(SETTINGS_PATH)) {
    try {
      const content = fs.readFileSync(SETTINGS_PATH, 'utf-8');
      return { ...DEFAULT_SETTINGS, ...JSON.parse(content) };
    } catch {
      return DEFAULT_SETTINGS;
    }
  }
  
  // Create default settings file
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(DEFAULT_SETTINGS, null, 2));
  return DEFAULT_SETTINGS;
}

/**
 * Get worker port from settings
 */
export function getWorkerPort() {
  const settings = loadSettings();
  return parseInt(settings.WORKER_PORT, 10) || DEFAULT_SETTINGS.WORKER_PORT;
}

/**
 * Get worker host from settings
 */
export function getWorkerHost() {
  const settings = loadSettings();
  return settings.WORKER_HOST || DEFAULT_SETTINGS.WORKER_HOST;
}

