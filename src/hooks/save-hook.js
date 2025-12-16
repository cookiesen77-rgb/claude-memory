/**
 * Save Hook - PostToolUse
 * 
 * Called after each tool use. Sends tool data to worker for observation storage.
 */

import { stdin } from 'process';
import { ensureWorkerRunning, getWorkerPort, createHookResponse } from './worker-utils.js';

/**
 * Check if content contains privacy tags
 */
function containsPrivateTags(content) {
  if (typeof content !== 'string') {
    content = JSON.stringify(content);
  }
  return content.includes('<private>') || content.includes('<claude-memory-context>');
}

/**
 * Save Hook Main Logic
 */
async function saveHook(input) {
  // Ensure worker is running
  await ensureWorkerRunning();
  
  if (!input) {
    console.error('[claude-memory] saveHook requires input');
    console.log(createHookResponse('PostToolUse'));
    return;
  }
  
  const { session_id, cwd, tool_name, tool_input, tool_response } = input;
  
  // Skip if contains private content
  if (containsPrivateTags(tool_input) || containsPrivateTags(tool_response)) {
    console.log(createHookResponse('PostToolUse'));
    return;
  }
  
  const port = getWorkerPort();
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(`http://127.0.0.1:${port}/api/sessions/observations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        claudeSessionId: session_id,
        tool_name,
        tool_input,
        tool_response,
        cwd
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    
    if (!response.ok) {
      console.error(`[claude-memory] Observation storage failed: ${response.status}`);
    }
  } catch (error) {
    if (error.name !== 'AbortError') {
      console.error(`[claude-memory] Observation error: ${error.message}`);
    }
  }
  
  console.log(createHookResponse('PostToolUse'));
}

// Entry Point
let input = '';
stdin.on('data', (chunk) => (input += chunk));
stdin.on('end', async () => {
  const parsed = input ? JSON.parse(input) : undefined;
  await saveHook(parsed);
});

