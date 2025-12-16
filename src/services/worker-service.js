/**
 * Worker Service - Express HTTP server for handling memory operations
 */

import express from 'express';
import http from 'http';
import path from 'path';
import { getWorkerPort, getWorkerHost, loadSettings } from '../utils/paths.js';
import { logger } from '../utils/logger.js';
import { getSessionStore } from './database.js';
import { generateContext } from './context-generator.js';
import { parseObservations, parseSummary } from '../sdk/parser.js';
import { buildInitPrompt, buildObservationPrompt, buildSummaryPrompt } from '../sdk/prompts.js';

export class WorkerService {
  constructor() {
    this.app = express();
    this.server = null;
    this.startTime = Date.now();
    this.db = null;
    
    // Active sessions tracking
    this.activeSessions = new Map();
    
    // Pending observations queue (per session)
    this.pendingObservations = new Map();
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Setup Express middleware
   */
  setupMiddleware() {
    this.app.use(express.json({ limit: '10mb' }));
    
    // Request logging
    this.app.use((req, res, next) => {
      logger.debug('HTTP', `${req.method} ${req.path}`);
      next();
    });
    
    // CORS headers
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
      }
      next();
    });
  }

  /**
   * Setup HTTP routes
   */
  setupRoutes() {
    // Health check
    this.app.get('/api/health', (req, res) => {
      res.json({ status: 'ok', uptime: Date.now() - this.startTime });
    });

    // Version endpoint
    this.app.get('/api/version', (req, res) => {
      res.json({ version: '1.0.0' });
    });

    // Context injection endpoint
    this.app.get('/api/context/inject', async (req, res) => {
      try {
        const project = req.query.project;
        if (!project) {
          return res.status(400).json({ error: 'Project parameter is required' });
        }

        const context = await generateContext(project);
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.send(context);
      } catch (error) {
        logger.error('WORKER', 'Context generation failed', {}, error);
        res.status(500).json({ error: error.message });
      }
    });

    // Session initialization (from new-hook)
    this.app.post('/api/sessions/init', async (req, res) => {
      try {
        const { sessionId, project, userPrompt } = req.body;
        
        if (!sessionId || !project) {
          return res.status(400).json({ error: 'sessionId and project are required' });
        }

        // Create/get session in database
        const db = this.getDatabase();
        const dbId = db.createSession(sessionId, project, userPrompt || '');
        
        // Increment prompt counter
        const promptNumber = db.incrementPromptCounter(sessionId);
        
        // Save user prompt
        if (userPrompt) {
          db.saveUserPrompt(sessionId, promptNumber, userPrompt);
        }

        // Initialize pending observations queue
        if (!this.pendingObservations.has(sessionId)) {
          this.pendingObservations.set(sessionId, []);
        }

        logger.info('WORKER', 'Session initialized', { sessionId, project, promptNumber });

        res.json({ 
          success: true, 
          dbId,
          promptNumber
        });
      } catch (error) {
        logger.error('WORKER', 'Session init failed', {}, error);
        res.status(500).json({ error: error.message });
      }
    });

    // Store observation (from save-hook)
    this.app.post('/api/sessions/observations', async (req, res) => {
      try {
        const { claudeSessionId, tool_name, tool_input, tool_response, cwd } = req.body;
        
        if (!claudeSessionId) {
          return res.status(400).json({ error: 'claudeSessionId is required' });
        }

        // Get session info
        const db = this.getDatabase();
        const session = db.getSession(claudeSessionId);
        
        if (!session) {
          // Auto-create session if it doesn't exist
          const project = cwd ? path.basename(cwd) : 'unknown-project';
          db.createSession(claudeSessionId, project, '');
        }

        const project = session?.project || (cwd ? path.basename(cwd) : 'unknown-project');
        const promptNumber = session?.prompt_counter || 1;

        // Queue the observation for processing
        const observation = {
          tool_name,
          tool_input,
          tool_response,
          cwd,
          timestamp: Date.now()
        };

        // Add to pending queue
        if (!this.pendingObservations.has(claudeSessionId)) {
          this.pendingObservations.set(claudeSessionId, []);
        }
        this.pendingObservations.get(claudeSessionId).push(observation);

        // Process observations asynchronously (simplified - no SDK agent)
        this.processObservation(claudeSessionId, project, observation, promptNumber);

        logger.debug('WORKER', 'Observation queued', { 
          sessionId: claudeSessionId, 
          toolName: tool_name 
        });

        res.json({ success: true, queued: true });
      } catch (error) {
        logger.error('WORKER', 'Observation storage failed', {}, error);
        res.status(500).json({ error: error.message });
      }
    });

    // Generate summary (from summary-hook)
    this.app.post('/api/sessions/summarize', async (req, res) => {
      try {
        const { claudeSessionId, last_user_message, last_assistant_message } = req.body;
        
        if (!claudeSessionId) {
          return res.status(400).json({ error: 'claudeSessionId is required' });
        }

        const db = this.getDatabase();
        const session = db.getSession(claudeSessionId);
        
        if (!session) {
          return res.status(404).json({ error: 'Session not found' });
        }

        // Create a simple summary from the assistant message
        // In production, you'd use Claude API to generate a structured summary
        const summary = this.createSimpleSummary(last_assistant_message, last_user_message);
        
        if (summary) {
          db.storeSummary(
            claudeSessionId,
            session.project,
            summary,
            session.prompt_counter
          );
          
          logger.info('WORKER', 'Summary created', { 
            sessionId: claudeSessionId,
            request: summary.request?.substring(0, 50) 
          });
        }

        // Mark session completed
        db.markSessionCompleted(claudeSessionId);

        res.json({ success: true });
      } catch (error) {
        logger.error('WORKER', 'Summary generation failed', {}, error);
        res.status(500).json({ error: error.message });
      }
    });

    // Search observations
    this.app.get('/api/search', async (req, res) => {
      try {
        const { q, project, limit } = req.query;
        
        if (!q) {
          return res.status(400).json({ error: 'Query parameter q is required' });
        }

        const db = this.getDatabase();
        const results = db.searchObservations(q, project, parseInt(limit, 10) || 20);

        res.json({ results, count: results.length });
      } catch (error) {
        logger.error('WORKER', 'Search failed', {}, error);
        res.status(500).json({ error: error.message });
      }
    });

    // Get observation by ID
    this.app.get('/api/observations/:id', async (req, res) => {
      try {
        const id = parseInt(req.params.id, 10);
        const db = this.getDatabase();
        const observation = db.getObservationById(id);
        
        if (!observation) {
          return res.status(404).json({ error: 'Observation not found' });
        }

        res.json(observation);
      } catch (error) {
        logger.error('WORKER', 'Get observation failed', {}, error);
        res.status(500).json({ error: error.message });
      }
    });

    // Get all projects
    this.app.get('/api/projects', async (req, res) => {
      try {
        const db = this.getDatabase();
        const projects = db.getAllProjects();
        res.json({ projects });
      } catch (error) {
        logger.error('WORKER', 'Get projects failed', {}, error);
        res.status(500).json({ error: error.message });
      }
    });

    // Admin endpoints
    this.app.post('/api/admin/restart', async (req, res) => {
      res.json({ status: 'restarting' });
      setTimeout(() => {
        this.shutdown().then(() => process.exit(0));
      }, 100);
    });

    this.app.post('/api/admin/shutdown', async (req, res) => {
      res.json({ status: 'shutting_down' });
      setTimeout(() => {
        this.shutdown().then(() => process.exit(0));
      }, 100);
    });
  }

  /**
   * Get database instance (lazy init)
   */
  getDatabase() {
    if (!this.db) {
      this.db = getSessionStore();
    }
    return this.db;
  }

  /**
   * Process a single observation (simplified - creates observation from tool use)
   */
  async processObservation(sessionId, project, obs, promptNumber) {
    try {
      const db = this.getDatabase();
      
      // Create a simplified observation from tool use
      // In production, you'd call Claude API to generate structured observation
      const observation = this.createSimpleObservation(obs);
      
      if (observation) {
        const result = db.storeObservation(
          sessionId,
          project,
          observation,
          promptNumber
        );
        
        logger.info('WORKER', 'Observation stored', {
          id: result.id,
          type: observation.type,
          title: observation.title?.substring(0, 40)
        });
      }
    } catch (error) {
      logger.error('WORKER', 'Process observation failed', { sessionId }, error);
    }
  }

  /**
   * Create simplified observation from tool use (without AI compression)
   */
  createSimpleObservation(obs) {
    const { tool_name, tool_input, tool_response } = obs;
    
    // Skip certain tools
    const skipTools = ['Read', 'LS', 'Glob'];
    if (skipTools.some(t => tool_name?.includes(t))) {
      return null;
    }

    // Determine observation type based on tool
    let type = 'change';
    if (tool_name?.includes('Write') || tool_name?.includes('Edit')) {
      type = 'change';
    } else if (tool_name?.includes('Bash')) {
      type = 'change';
    }

    // Extract file info from tool input
    let files_modified = [];
    let files_read = [];
    
    if (tool_input?.file_path) {
      files_modified.push(tool_input.file_path);
    }
    if (tool_input?.target_file) {
      files_modified.push(tool_input.target_file);
    }

    // Create title from tool name and input
    let title = tool_name || 'Tool execution';
    if (tool_input?.file_path) {
      title = `Modified ${path.basename(tool_input.file_path)}`;
    } else if (tool_input?.command) {
      title = `Executed: ${tool_input.command.substring(0, 40)}`;
    }

    return {
      type,
      title,
      subtitle: `Tool: ${tool_name}`,
      facts: [],
      narrative: null,
      concepts: ['what-changed'],
      files_read,
      files_modified
    };
  }

  /**
   * Create simplified summary from assistant message (without AI compression)
   */
  createSimpleSummary(assistantMessage, userMessage) {
    if (!assistantMessage) return null;

    // Extract first line as request
    const firstLine = (userMessage || assistantMessage).split('\n')[0].substring(0, 100);
    
    return {
      request: firstLine,
      investigated: null,
      learned: null,
      completed: assistantMessage.substring(0, 200),
      next_steps: null,
      notes: null
    };
  }

  /**
   * Start the worker service
   */
  async start() {
    const port = getWorkerPort();
    const host = getWorkerHost();
    
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(port, host, () => {
        logger.success('WORKER', 'Worker started', { host, port, pid: process.pid });
        resolve();
      });
      
      this.server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          logger.warn('WORKER', 'Port already in use, worker may already be running', { port });
          resolve(); // Not a fatal error
        } else {
          logger.error('WORKER', 'Failed to start', {}, err);
          reject(err);
        }
      });
    });
  }

  /**
   * Shutdown the worker service
   */
  async shutdown() {
    logger.info('WORKER', 'Shutting down...');
    
    // Close database
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    
    // Close server
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          logger.info('WORKER', 'Server closed');
          resolve();
        });
      });
    }
  }
}

// Main entry point
if (process.argv[1]?.endsWith('worker-service.js') || process.argv[1]?.endsWith('worker-service.cjs')) {
  const worker = new WorkerService();
  
  // Graceful shutdown
  process.on('SIGTERM', async () => {
    await worker.shutdown();
    process.exit(0);
  });
  
  process.on('SIGINT', async () => {
    await worker.shutdown();
    process.exit(0);
  });
  
  worker.start().catch((err) => {
    logger.error('WORKER', 'Failed to start', {}, err);
    process.exit(1);
  });
}

export default WorkerService;

