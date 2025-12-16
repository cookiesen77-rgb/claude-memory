/**
 * Database Service - SQLite storage for sessions, observations, and summaries
 */

import Database from 'better-sqlite3';
import { DATA_DIR, DB_PATH, ensureDir } from '../utils/paths.js';
import { logger } from '../utils/logger.js';

/**
 * Session Store - handles all database operations
 */
export class SessionStore {
  constructor() {
    ensureDir(DATA_DIR);
    this.db = new Database(DB_PATH);
    
    // Optimize SQLite settings
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');
    
    // Initialize schema
    this.initializeSchema();
  }

  /**
   * Initialize database schema
   */
  initializeSchema() {
    // Sessions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT UNIQUE NOT NULL,
        project TEXT NOT NULL,
        user_prompt TEXT,
        prompt_counter INTEGER DEFAULT 0,
        started_at TEXT NOT NULL,
        started_at_epoch INTEGER NOT NULL,
        completed_at TEXT,
        completed_at_epoch INTEGER,
        status TEXT CHECK(status IN ('active', 'completed', 'failed')) NOT NULL DEFAULT 'active'
      );
      
      CREATE INDEX IF NOT EXISTS idx_sessions_session_id ON sessions(session_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project);
      CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
    `);

    // Observations table - stores compressed tool use observations
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS observations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        project TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('decision', 'bugfix', 'feature', 'refactor', 'discovery', 'change')),
        title TEXT,
        subtitle TEXT,
        facts TEXT,
        narrative TEXT,
        concepts TEXT,
        files_read TEXT,
        files_modified TEXT,
        prompt_number INTEGER,
        discovery_tokens INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        created_at_epoch INTEGER NOT NULL,
        FOREIGN KEY(session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS idx_observations_session_id ON observations(session_id);
      CREATE INDEX IF NOT EXISTS idx_observations_project ON observations(project);
      CREATE INDEX IF NOT EXISTS idx_observations_type ON observations(type);
      CREATE INDEX IF NOT EXISTS idx_observations_created ON observations(created_at_epoch DESC);
    `);

    // Session summaries table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS session_summaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        project TEXT NOT NULL,
        request TEXT,
        investigated TEXT,
        learned TEXT,
        completed TEXT,
        next_steps TEXT,
        notes TEXT,
        prompt_number INTEGER,
        discovery_tokens INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        created_at_epoch INTEGER NOT NULL,
        FOREIGN KEY(session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS idx_summaries_session_id ON session_summaries(session_id);
      CREATE INDEX IF NOT EXISTS idx_summaries_project ON session_summaries(project);
      CREATE INDEX IF NOT EXISTS idx_summaries_created ON session_summaries(created_at_epoch DESC);
    `);

    // User prompts table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_prompts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        prompt_number INTEGER NOT NULL,
        prompt_text TEXT NOT NULL,
        created_at TEXT NOT NULL,
        created_at_epoch INTEGER NOT NULL,
        FOREIGN KEY(session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS idx_prompts_session_id ON user_prompts(session_id);
      CREATE INDEX IF NOT EXISTS idx_prompts_created ON user_prompts(created_at_epoch DESC);
    `);

    // FTS5 for full-text search on observations
    try {
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS observations_fts USING fts5(
          title, subtitle, narrative, facts,
          content='observations',
          content_rowid='id'
        );
        
        -- Triggers to sync FTS
        CREATE TRIGGER IF NOT EXISTS observations_ai AFTER INSERT ON observations BEGIN
          INSERT INTO observations_fts(rowid, title, subtitle, narrative, facts)
          VALUES (new.id, new.title, new.subtitle, new.narrative, new.facts);
        END;
        
        CREATE TRIGGER IF NOT EXISTS observations_ad AFTER DELETE ON observations BEGIN
          INSERT INTO observations_fts(observations_fts, rowid, title, subtitle, narrative, facts)
          VALUES('delete', old.id, old.title, old.subtitle, old.narrative, old.facts);
        END;
        
        CREATE TRIGGER IF NOT EXISTS observations_au AFTER UPDATE ON observations BEGIN
          INSERT INTO observations_fts(observations_fts, rowid, title, subtitle, narrative, facts)
          VALUES('delete', old.id, old.title, old.subtitle, old.narrative, old.facts);
          INSERT INTO observations_fts(rowid, title, subtitle, narrative, facts)
          VALUES (new.id, new.title, new.subtitle, new.narrative, new.facts);
        END;
      `);
    } catch (err) {
      // FTS triggers might already exist
      logger.debug('DB', 'FTS setup skipped (may already exist)', { error: err.message });
    }

    logger.info('DB', 'Database schema initialized');
  }

  // ============================================================================
  // Session Operations
  // ============================================================================

  /**
   * Create or get existing session (idempotent)
   */
  createSession(sessionId, project, userPrompt = '') {
    const now = new Date();
    const nowEpoch = now.getTime();

    // INSERT OR IGNORE makes this idempotent
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO sessions
      (session_id, project, user_prompt, started_at, started_at_epoch, status)
      VALUES (?, ?, ?, ?, ?, 'active')
    `);

    const result = stmt.run(sessionId, project, userPrompt, now.toISOString(), nowEpoch);

    // If insert was ignored, update project/prompt if provided
    if (result.changes === 0 && project) {
      this.db.prepare(`
        UPDATE sessions SET project = ?, user_prompt = ? WHERE session_id = ?
      `).run(project, userPrompt, sessionId);
    }

    // Get the session ID
    const session = this.db.prepare('SELECT id FROM sessions WHERE session_id = ?').get(sessionId);
    return session?.id;
  }

  /**
   * Get session by session_id
   */
  getSession(sessionId) {
    return this.db.prepare('SELECT * FROM sessions WHERE session_id = ?').get(sessionId);
  }

  /**
   * Increment prompt counter
   */
  incrementPromptCounter(sessionId) {
    this.db.prepare(`
      UPDATE sessions SET prompt_counter = prompt_counter + 1 WHERE session_id = ?
    `).run(sessionId);
    
    const result = this.db.prepare('SELECT prompt_counter FROM sessions WHERE session_id = ?').get(sessionId);
    return result?.prompt_counter || 1;
  }

  /**
   * Get current prompt counter
   */
  getPromptCounter(sessionId) {
    const result = this.db.prepare('SELECT prompt_counter FROM sessions WHERE session_id = ?').get(sessionId);
    return result?.prompt_counter || 0;
  }

  /**
   * Mark session completed
   */
  markSessionCompleted(sessionId) {
    const now = new Date();
    this.db.prepare(`
      UPDATE sessions SET status = 'completed', completed_at = ?, completed_at_epoch = ?
      WHERE session_id = ?
    `).run(now.toISOString(), now.getTime(), sessionId);
  }

  // ============================================================================
  // Observation Operations
  // ============================================================================

  /**
   * Store an observation
   */
  storeObservation(sessionId, project, observation, promptNumber = null, discoveryTokens = 0) {
    const now = new Date();
    const nowEpoch = now.getTime();

    // Ensure session exists
    this.createSession(sessionId, project, '');

    const stmt = this.db.prepare(`
      INSERT INTO observations
      (session_id, project, type, title, subtitle, facts, narrative, concepts,
       files_read, files_modified, prompt_number, discovery_tokens, created_at, created_at_epoch)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      sessionId,
      project,
      observation.type || 'change',
      observation.title || null,
      observation.subtitle || null,
      JSON.stringify(observation.facts || []),
      observation.narrative || null,
      JSON.stringify(observation.concepts || []),
      JSON.stringify(observation.files_read || []),
      JSON.stringify(observation.files_modified || []),
      promptNumber,
      discoveryTokens,
      now.toISOString(),
      nowEpoch
    );

    return { id: result.lastInsertRowid, createdAtEpoch: nowEpoch };
  }

  /**
   * Get recent observations for a project
   */
  getRecentObservations(project, limit = 50) {
    return this.db.prepare(`
      SELECT * FROM observations
      WHERE project = ?
      ORDER BY created_at_epoch DESC
      LIMIT ?
    `).all(project, limit);
  }

  /**
   * Get observation by ID
   */
  getObservationById(id) {
    return this.db.prepare('SELECT * FROM observations WHERE id = ?').get(id);
  }

  /**
   * Search observations using FTS
   */
  searchObservations(query, project = null, limit = 20) {
    let sql = `
      SELECT o.* FROM observations o
      JOIN observations_fts fts ON o.id = fts.rowid
      WHERE observations_fts MATCH ?
    `;
    const params = [query];

    if (project) {
      sql += ' AND o.project = ?';
      params.push(project);
    }

    sql += ' ORDER BY o.created_at_epoch DESC LIMIT ?';
    params.push(limit);

    return this.db.prepare(sql).all(...params);
  }

  // ============================================================================
  // Summary Operations
  // ============================================================================

  /**
   * Store a session summary
   */
  storeSummary(sessionId, project, summary, promptNumber = null, discoveryTokens = 0) {
    const now = new Date();
    const nowEpoch = now.getTime();

    // Ensure session exists
    this.createSession(sessionId, project, '');

    const stmt = this.db.prepare(`
      INSERT INTO session_summaries
      (session_id, project, request, investigated, learned, completed,
       next_steps, notes, prompt_number, discovery_tokens, created_at, created_at_epoch)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      sessionId,
      project,
      summary.request || null,
      summary.investigated || null,
      summary.learned || null,
      summary.completed || null,
      summary.next_steps || null,
      summary.notes || null,
      promptNumber,
      discoveryTokens,
      now.toISOString(),
      nowEpoch
    );

    return { id: result.lastInsertRowid, createdAtEpoch: nowEpoch };
  }

  /**
   * Get recent summaries for a project
   */
  getRecentSummaries(project, limit = 10) {
    return this.db.prepare(`
      SELECT * FROM session_summaries
      WHERE project = ?
      ORDER BY created_at_epoch DESC
      LIMIT ?
    `).all(project, limit);
  }

  // ============================================================================
  // User Prompt Operations
  // ============================================================================

  /**
   * Save a user prompt
   */
  saveUserPrompt(sessionId, promptNumber, promptText) {
    const now = new Date();
    const nowEpoch = now.getTime();

    const stmt = this.db.prepare(`
      INSERT INTO user_prompts
      (session_id, prompt_number, prompt_text, created_at, created_at_epoch)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(sessionId, promptNumber, promptText, now.toISOString(), nowEpoch);
    return result.lastInsertRowid;
  }

  // ============================================================================
  // Context Generation
  // ============================================================================

  /**
   * Get all unique projects
   */
  getAllProjects() {
    const rows = this.db.prepare(`
      SELECT DISTINCT project FROM sessions
      WHERE project IS NOT NULL AND project != ''
      ORDER BY project ASC
    `).all();
    return rows.map(r => r.project);
  }

  /**
   * Get context data for a project (observations + summaries)
   */
  getContextData(project, observationLimit = 50, summaryLimit = 10) {
    const observations = this.getRecentObservations(project, observationLimit);
    const summaries = this.getRecentSummaries(project, summaryLimit);
    
    return { observations, summaries };
  }

  /**
   * Close database connection
   */
  close() {
    this.db.close();
  }
}

// Export singleton instance getter
let instance = null;

export function getSessionStore() {
  if (!instance) {
    instance = new SessionStore();
  }
  return instance;
}

