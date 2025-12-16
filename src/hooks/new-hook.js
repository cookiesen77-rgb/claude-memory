/**
 * New Hook - UserPromptSubmit
 * 
 * Called when user submits a prompt. Initializes or continues a session.
 */

import path from 'path';
import { stdin } from 'process';
import { ensureWorkerRunning, getWorkerPort, createHookResponse } from './worker-utils.js';

/**
 * New Hook Main Logic
 */
async function newHook(input) {
  // Ensure worker is running
  await ensureWorkerRunning();
  
  if (!input) {
    console.error('[claude-memory] newHook requires input');
    return;
  }
  
  const { session_id, cwd, user_prompt } = input;
  
  if (!session_id) {
    console.error('[claude-memory] Missing session_id in input');
    return;
  }
  
  const project = cwd ? path.basename(cwd) : 'unknown-project';
  const port = getWorkerPort();
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(`http://127.0.0.1:${port}/api/sessions/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: session_id,
        project,
        userPrompt: user_prompt || ''
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[claude-memory] Session init failed: ${response.status} - ${errorText}`);
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('[claude-memory] Session init timed out');
    } else {
      console.error(`[claude-memory] Session init error: ${error.message}`);
    }
  }
  
  console.log(createHookResponse('UserPromptSubmit'));
}

// Entry Point
let input = '';
stdin.on('data', (chunk) => (input += chunk));
stdin.on('end', async () => {
  const parsed = input ? JSON.parse(input) : undefined;
  await newHook(parsed);
});

