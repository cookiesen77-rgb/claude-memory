/**
 * Context Hook - SessionStart
 * 
 * Injects relevant context from previous sessions into the current session.
 * Called at session startup to provide Claude with historical context.
 */

import path from 'path';
import { stdin, stdout } from 'process';
import { ensureWorkerRunning, getWorkerPort, createHookResponse } from './worker-utils.js';

/**
 * Context Hook Main Logic
 */
async function contextHook(input) {
  // Ensure worker is running
  await ensureWorkerRunning();
  
  const cwd = input?.cwd ?? process.cwd();
  const project = cwd ? path.basename(cwd) : 'unknown-project';
  const port = getWorkerPort();
  
  const url = `http://127.0.0.1:${port}/api/context/inject?project=${encodeURIComponent(project)}`;
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    
    if (!response.ok) {
      console.error(`[claude-memory] Context generation failed: ${response.status}`);
      return '';
    }
    
    const contextText = await response.text();
    return contextText.trim();
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('[claude-memory] Context generation timed out');
    } else {
      console.error(`[claude-memory] Context generation error: ${error.message}`);
    }
    return '';
  }
}

// Entry Point - handle stdin/stdout
const forceColors = process.argv.includes('--colors');

if (stdin.isTTY || forceColors) {
  // Interactive mode - just print context
  contextHook(undefined).then((text) => {
    console.log(text);
    process.exit(0);
  });
} else {
  // Pipe mode - parse JSON input and output hook response
  let input = '';
  stdin.on('data', (chunk) => (input += chunk));
  stdin.on('end', async () => {
    const parsed = input.trim() ? JSON.parse(input) : undefined;
    const text = await contextHook(parsed);
    
    // Wrap context in claude-memory-context tags to prevent recursive observation
    const wrappedContext = text ? `<claude-memory-context>\n${text}\n</claude-memory-context>` : '';
    
    console.log(createHookResponse('SessionStart', wrappedContext));
    process.exit(0);
  });
}

