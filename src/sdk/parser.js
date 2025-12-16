/**
 * XML Parser - parses observation and summary XML from AI responses
 */

import { logger } from '../utils/logger.js';

/**
 * Parse observation XML blocks from AI response
 */
export function parseObservations(text) {
  const observations = [];
  
  // Match <observation>...</observation> blocks
  const observationRegex = /<observation>([\s\S]*?)<\/observation>/g;
  
  let match;
  while ((match = observationRegex.exec(text)) !== null) {
    const content = match[1];
    
    // Extract fields
    const type = extractField(content, 'type');
    const title = extractField(content, 'title');
    const subtitle = extractField(content, 'subtitle');
    const narrative = extractField(content, 'narrative');
    const facts = extractArrayElements(content, 'facts', 'fact');
    const concepts = extractArrayElements(content, 'concepts', 'concept');
    const files_read = extractArrayElements(content, 'files_read', 'file');
    const files_modified = extractArrayElements(content, 'files_modified', 'file');
    
    // Validate type
    const validTypes = ['bugfix', 'feature', 'refactor', 'change', 'discovery', 'decision'];
    let finalType = 'change'; // Default
    
    if (type && validTypes.includes(type.trim())) {
      finalType = type.trim();
    } else if (type) {
      logger.warn('PARSER', `Invalid observation type: ${type}, using "change"`);
    }
    
    observations.push({
      type: finalType,
      title,
      subtitle,
      facts,
      narrative,
      concepts,
      files_read,
      files_modified
    });
  }
  
  return observations;
}

/**
 * Parse summary XML block from AI response
 */
export function parseSummary(text) {
  // Check for skip_summary
  const skipRegex = /<skip_summary\s+reason="([^"]+)"\s*\/>/;
  const skipMatch = skipRegex.exec(text);
  
  if (skipMatch) {
    logger.info('PARSER', 'Summary skipped', { reason: skipMatch[1] });
    return null;
  }
  
  // Match <summary>...</summary> block
  const summaryRegex = /<summary>([\s\S]*?)<\/summary>/;
  const summaryMatch = summaryRegex.exec(text);
  
  if (!summaryMatch) {
    return null;
  }
  
  const content = summaryMatch[1];
  
  return {
    request: extractField(content, 'request'),
    investigated: extractField(content, 'investigated'),
    learned: extractField(content, 'learned'),
    completed: extractField(content, 'completed'),
    next_steps: extractField(content, 'next_steps'),
    notes: extractField(content, 'notes')
  };
}

/**
 * Extract a simple field value from XML content
 */
function extractField(content, fieldName) {
  const regex = new RegExp(`<${fieldName}>([^<]*)</${fieldName}>`);
  const match = regex.exec(content);
  if (!match) return null;
  
  const trimmed = match[1].trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Extract array of elements from XML content
 */
function extractArrayElements(content, arrayName, elementName) {
  const elements = [];
  
  // Match the array block
  const arrayRegex = new RegExp(`<${arrayName}>(.*?)</${arrayName}>`, 's');
  const arrayMatch = arrayRegex.exec(content);
  
  if (!arrayMatch) {
    return elements;
  }
  
  const arrayContent = arrayMatch[1];
  
  // Extract individual elements
  const elementRegex = new RegExp(`<${elementName}>([^<]+)</${elementName}>`, 'g');
  let elementMatch;
  while ((elementMatch = elementRegex.exec(arrayContent)) !== null) {
    elements.push(elementMatch[1].trim());
  }
  
  return elements;
}

