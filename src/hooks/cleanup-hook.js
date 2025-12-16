/**
 * Cleanup Hook - SessionEnd
 * 
 * Called when session ends. Performs any necessary cleanup.
 */

import { stdin } from 'process';
import { createHookResponse } from './worker-utils.js';

/**
 * Cleanup Hook Main Logic
 */
async function cleanupHook(input) {
  // Currently no cleanup needed - database handles its own cleanup
  // This hook is here for future extensibility
  
  console.log(createHookResponse('SessionEnd'));
}

// Entry Point
let input = '';
stdin.on('data', (chunk) => (input += chunk));
stdin.on('end', async () => {
  const parsed = input ? JSON.parse(input) : undefined;
  await cleanupHook(parsed);
});

