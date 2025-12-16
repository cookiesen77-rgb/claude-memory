/**
 * Context Generator - generates context injection for SessionStart
 */

import path from 'path';
import { getSessionStore } from './database.js';
import { loadSettings } from '../utils/paths.js';

// Type icons for observations
const TYPE_ICON_MAP = {
  'bugfix': '🔴',
  'feature': '🟣',
  'refactor': '🔄',
  'change': '✅',
  'discovery': '🔵',
  'decision': '⚖️'
};

/**
 * Format date from ISO string
 */
function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', { 
    weekday: 'short', 
    month: 'short', 
    day: 'numeric' 
  });
}

/**
 * Format time from ISO string
 */
function formatTime(isoString) {
  const date = new Date(isoString);
  return date.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false 
  });
}

/**
 * Parse JSON array safely
 */
function parseJsonArray(str) {
  if (!str) return [];
  try {
    const parsed = JSON.parse(str);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Extract first file from JSON array
 */
function extractFirstFile(filesJson, cwd = '') {
  const files = parseJsonArray(filesJson);
  if (files.length === 0) return '(no file)';
  
  let file = files[0];
  // Make relative to cwd if possible
  if (cwd && file.startsWith(cwd)) {
    file = file.substring(cwd.length + 1);
  }
  return file || '(no file)';
}

/**
 * Generate context injection text for a project
 */
export async function generateContext(project, useColors = false) {
  const settings = loadSettings();
  const observationLimit = parseInt(settings.CONTEXT_OBSERVATIONS, 10) || 50;
  
  let db;
  try {
    db = getSessionStore();
  } catch (error) {
    console.error('Failed to open database:', error.message);
    return '';
  }
  
  // Get recent observations and summaries
  const observations = db.getRecentObservations(project, observationLimit);
  const summaries = db.getRecentSummaries(project, 10);
  
  // Empty state
  if (observations.length === 0 && summaries.length === 0) {
    return `# [${project}] recent context\n\nNo previous sessions found for this project yet.`;
  }
  
  const output = [];
  
  // Header
  output.push(`# [${project}] recent context`);
  output.push('');
  
  // Legend
  output.push(`**Legend:** 🎯 session-request | 🔴 bugfix | 🟣 feature | 🔄 refactor | ✅ change | 🔵 discovery | ⚖️ decision`);
  output.push('');
  
  // Context Index Instructions
  output.push(`💡 **Context Index:** This semantic index (titles, types, files, tokens) is usually sufficient to understand past work.`);
  output.push('');
  output.push(`When you need implementation details, rationale, or debugging context:`);
  output.push(`- Use the mem-search skill to fetch full observations on-demand`);
  output.push(`- Critical types (🔴 bugfix, ⚖️ decision) often need detailed fetching`);
  output.push(`- Trust this index over re-reading code for past decisions and learnings`);
  output.push('');
  
  // Context Economics
  const totalReadTokens = observations.reduce((sum, obs) => {
    const size = (obs.title?.length || 0) +
                 (obs.subtitle?.length || 0) +
                 (obs.narrative?.length || 0) +
                 (obs.facts?.length || 0);
    return sum + Math.ceil(size / 4);
  }, 0);
  
  const totalDiscoveryTokens = observations.reduce((sum, obs) => sum + (obs.discovery_tokens || 0), 0);
  const savings = totalDiscoveryTokens - totalReadTokens;
  const savingsPercent = totalDiscoveryTokens > 0 ? Math.round((savings / totalDiscoveryTokens) * 100) : 0;
  
  output.push(`📊 **Context Economics**:`);
  output.push(`- Loading: ${observations.length} observations (~${totalReadTokens.toLocaleString()} tokens to read)`);
  output.push(`- Work investment: ~${totalDiscoveryTokens.toLocaleString()} tokens spent on research, building, and decisions`);
  if (savings > 0) {
    output.push(`- Your savings: ~${savings.toLocaleString()} tokens (${savingsPercent}% reduction from reuse)`);
  }
  output.push('');
  
  // Group observations by day
  const observationsByDay = new Map();
  for (const obs of observations) {
    const day = formatDate(obs.created_at);
    if (!observationsByDay.has(day)) {
      observationsByDay.set(day, []);
    }
    observationsByDay.get(day).push(obs);
  }
  
  // Render observations by day (reverse chronological within each day for context)
  const sortedDays = Array.from(observationsByDay.entries())
    .sort((a, b) => new Date(b[1][0].created_at) - new Date(a[1][0].created_at));
  
  for (const [day, dayObs] of sortedDays) {
    output.push(`### ${day}`);
    output.push('');
    output.push(`| ID | Time | T | Title | File |`);
    output.push(`|----|------|---|-------|------|`);
    
    // Sort by time (oldest first within day for narrative flow)
    dayObs.sort((a, b) => a.created_at_epoch - b.created_at_epoch);
    
    let lastTime = '';
    for (const obs of dayObs) {
      const time = formatTime(obs.created_at);
      const icon = TYPE_ICON_MAP[obs.type] || '•';
      const title = obs.title || 'Untitled';
      const file = extractFirstFile(obs.files_modified);
      const timeDisplay = time !== lastTime ? time : '″';
      lastTime = time;
      
      output.push(`| #${obs.id} | ${timeDisplay} | ${icon} | ${title} | ${file} |`);
    }
    
    output.push('');
  }
  
  // Show most recent summary if available
  if (summaries.length > 0) {
    const mostRecent = summaries[0];
    output.push('---');
    output.push('');
    output.push(`**📋 Last Session Summary**`);
    output.push('');
    if (mostRecent.request) output.push(`- **Request:** ${mostRecent.request}`);
    if (mostRecent.completed) output.push(`- **Completed:** ${mostRecent.completed}`);
    if (mostRecent.next_steps) output.push(`- **Next Steps:** ${mostRecent.next_steps}`);
    output.push('');
  }
  
  // Footer
  if (totalDiscoveryTokens > 0 && savings > 0) {
    const workTokensK = Math.round(totalDiscoveryTokens / 1000);
    output.push(`💰 Access ${workTokensK}k tokens of past research & decisions for just ~${totalReadTokens.toLocaleString()}t. Use the mem-search skill to access memories by ID.`);
  }
  
  return output.join('\n').trimEnd();
}

