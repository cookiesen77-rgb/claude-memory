/**
 * Worker utilities for hooks - ensures worker is running before hook operations
 */

import { spawn, execSync } from 'child_process';
import { homedir } from 'os';
import path from 'path';
import fs from 'fs';

// Default worker port (use 7777 to avoid conflict with original claude-mem)
const DEFAULT_PORT = 7777;

/**
 * Get plugin directory - checks multiple possible installation locations
 */
function getPluginDir() {
  // Check all possible installation paths (in priority order)
  const possiblePaths = [
    // Environment variable from Claude Code (if valid)
    process.env.CLAUDE_PLUGIN_ROOT,
    // Local marketplace installation (primary)
    path.join(homedir(), '.claude', 'plugins', 'cache', 'local', 'claude-memory', '1.0.0'),
    // Direct plugin directory (legacy)
    path.join(homedir(), '.claude', 'plugins', 'claude-memory'),
    // Version 2.0.0 if upgraded
    path.join(homedir(), '.claude', 'plugins', 'cache', 'local', 'claude-memory', '2.0.0'),
  ].filter(Boolean); // Remove undefined/null values
  
  // Find the first path that has the worker script
  for (const p of possiblePaths) {
    const workerPath = path.join(p, 'scripts', 'worker-service.cjs');
    if (fs.existsSync(workerPath)) {
      return p;
    }
  }
  
  // Fallback - return primary installed path
  return path.join(homedir(), '.claude', 'plugins', 'cache', 'local', 'claude-memory', '1.0.0');
}

const PLUGIN_DIR = getPluginDir();

/**
 * Get worker port from settings
 */
export function getWorkerPort() {
  const settingsPath = path.join(homedir(), '.claude-memory', 'settings.json');
  
  if (fs.existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      // Support both old and new config key names
      return parseInt(settings.CLAUDE_MEM_WORKER_PORT || settings.WORKER_PORT, 10) || DEFAULT_PORT;
    } catch {
      return DEFAULT_PORT;
    }
  }
  
  return DEFAULT_PORT;
}

/**
 * Check if worker is running
 */
export async function isWorkerRunning() {
  const port = getWorkerPort();
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Start worker service
 */
export async function startWorker() {
  const workerScript = path.join(PLUGIN_DIR, 'scripts', 'worker-service.cjs');
  
  // Check if script exists
  if (!fs.existsSync(workerScript)) {
    console.error(`Worker script not found: ${workerScript}`);
    return false;
  }
  
  // Start worker in background
  const child = spawn('node', [workerScript], {
    detached: true,
    stdio: 'ignore',
    cwd: PLUGIN_DIR
  });
  
  child.unref();
  
  // Wait for worker to be ready
  const maxWait = 10000;
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWait) {
    await new Promise(resolve => setTimeout(resolve, 200));
    
    if (await isWorkerRunning()) {
      return true;
    }
  }
  
  return false;
}

/**
 * Ensure worker is running (start if needed)
 */
export async function ensureWorkerRunning() {
  if (await isWorkerRunning()) {
    return true;
  }
  
  console.log('[claude-memory] Starting worker service...');
  const started = await startWorker();
  
  if (!started) {
    console.error('[claude-memory] Failed to start worker service');
  }
  
  return started;
}

/**
 * Create standard hook response
 */
export function createHookResponse(hookEventName, additionalContext = null) {
  const response = {
    hookSpecificOutput: {
      hookEventName
    }
  };
  
  if (additionalContext) {
    response.hookSpecificOutput.additionalContext = additionalContext;
  }
  
  return JSON.stringify(response);
}

