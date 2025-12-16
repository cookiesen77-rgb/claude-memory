/**
 * Summary Hook - Stop
 * 
 * Called when Claude stops responding. Generates session summary.
 */

import fs from 'fs';
import { stdin } from 'process';
import { ensureWorkerRunning, getWorkerPort, createHookResponse } from './worker-utils.js';

/**
 * Extract last message from transcript
 */
function extractLastMessage(transcriptPath, type) {
  try {
    if (!fs.existsSync(transcriptPath)) {
      return '';
    }
    
    const content = fs.readFileSync(transcriptPath, 'utf-8').trim();
    if (!content) return '';
    
    const lines = content.split('\n').filter(line => line.trim());
    
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const entry = JSON.parse(lines[i]);
        
        if (entry.type === type && entry.message?.content) {
          // Extract text from content array
          if (Array.isArray(entry.message.content)) {
            let text = '';
            for (const block of entry.message.content) {
              if (block.type === 'text') {
                text += block.text;
              }
            }
            // Remove system reminders
            text = text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim();
            if (text) return text;
          } else if (typeof entry.message.content === 'string') {
            return entry.message.content.trim();
          }
        }
      } catch {
        continue;
      }
    }
    
    return '';
  } catch (error) {
    console.error(`[claude-memory] Failed to extract ${type} message:`, error.message);
    return '';
  }
}

/**
 * Summary Hook Main Logic
 */
async function summaryHook(input) {
  // Ensure worker is running
  await ensureWorkerRunning();
  
  if (!input) {
    console.error('[claude-memory] summaryHook requires input');
    console.log(createHookResponse('Stop'));
    return;
  }
  
  const { session_id, transcript_path } = input;
  
  if (!session_id) {
    console.error('[claude-memory] Missing session_id');
    console.log(createHookResponse('Stop'));
    return;
  }
  
  const port = getWorkerPort();
  
  // Extract last messages from transcript
  const lastUserMessage = transcript_path ? extractLastMessage(transcript_path, 'user') : '';
  const lastAssistantMessage = transcript_path ? extractLastMessage(transcript_path, 'assistant') : '';
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    
    const response = await fetch(`http://127.0.0.1:${port}/api/sessions/summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        claudeSessionId: session_id,
        last_user_message: lastUserMessage,
        last_assistant_message: lastAssistantMessage
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    
    if (!response.ok) {
      console.error(`[claude-memory] Summary generation failed: ${response.status}`);
    }
  } catch (error) {
    if (error.name !== 'AbortError') {
      console.error(`[claude-memory] Summary error: ${error.message}`);
    }
  }
  
  console.log(createHookResponse('Stop'));
}

// Entry Point
let input = '';
stdin.on('data', (chunk) => (input += chunk));
stdin.on('end', async () => {
  const parsed = input ? JSON.parse(input) : undefined;
  await summaryHook(parsed);
});

