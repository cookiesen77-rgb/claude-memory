/**
 * Install Plugin Script - copies built plugin to Claude plugins directory
 */

import { cpSync, mkdirSync, existsSync, writeFileSync, rmSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

// Directories
const PLUGIN_SOURCE = join(ROOT, 'plugin');
const CLAUDE_PLUGINS_DIR = join(homedir(), '.claude', 'plugins');
const PLUGIN_TARGET = join(CLAUDE_PLUGINS_DIR, 'claude-memory');
const DATA_DIR = join(homedir(), '.claude-memory');

async function install() {
  console.log('Installing claude-memory plugin...\n');

  // 1. Ensure Claude plugins directory exists
  mkdirSync(CLAUDE_PLUGINS_DIR, { recursive: true });

  // 2. Check if source is built
  if (!existsSync(join(PLUGIN_SOURCE, 'scripts', 'context-hook.cjs'))) {
    console.error('Error: Plugin not built. Run "npm run build" first.');
    process.exit(1);
  }

  // 3. Remove existing installation
  if (existsSync(PLUGIN_TARGET)) {
    console.log('  Removing existing installation...');
    rmSync(PLUGIN_TARGET, { recursive: true, force: true });
  }

  // 4. Copy plugin to Claude plugins directory
  console.log('  Copying plugin files...');
  cpSync(PLUGIN_SOURCE, PLUGIN_TARGET, { recursive: true });

  // 5. Create .claude-plugin/plugin.json (required for Claude Code to recognize the plugin)
  console.log('  Creating plugin manifest...');
  const claudePluginDir = join(PLUGIN_TARGET, '.claude-plugin');
  mkdirSync(claudePluginDir, { recursive: true });
  writeFileSync(join(claudePluginDir, 'plugin.json'), JSON.stringify({
    name: 'claude-memory',
    version: '1.0.0',
    description: 'Persistent memory system for Claude Code - seamlessly preserve context across sessions',
    author: { name: 'Local' },
    license: 'MIT',
    keywords: ['memory', 'context', 'persistence', 'hooks']
  }, null, 2));

  // 6. Install better-sqlite3 in plugin directory
  console.log('  Installing native dependencies...');
  const { execSync } = await import('child_process');
  try {
    execSync('npm install better-sqlite3@11.7.0', {
      cwd: PLUGIN_TARGET,
      stdio: 'inherit'
    });
  } catch (err) {
    console.error('Warning: Failed to install better-sqlite3. You may need to install it manually.');
  }

  // 7. Create data directory
  mkdirSync(DATA_DIR, { recursive: true });

  // 8. Create default settings if not exists
  const settingsPath = join(DATA_DIR, 'settings.json');
  if (!existsSync(settingsPath)) {
    console.log('  Creating default settings...');
    const defaultSettings = {
      WORKER_PORT: 37779,
      WORKER_HOST: '127.0.0.1',
      CONTEXT_OBSERVATIONS: 50,
      LOG_LEVEL: 'INFO'
    };
    writeFileSync(settingsPath, JSON.stringify(defaultSettings, null, 2));
  }

  // 9. Create logs directory
  mkdirSync(join(DATA_DIR, 'logs'), { recursive: true });

  console.log('\n✓ Installation complete!');
  console.log(`\n  Plugin installed to: ${PLUGIN_TARGET}`);
  console.log(`  Data directory: ${DATA_DIR}`);
  console.log(`  Settings: ${settingsPath}`);
  
  console.log('\n📋 Next steps:');
  console.log('  1. Restart Claude Code to load the plugin');
  console.log('  2. Start a new session to test memory injection');
  console.log('  3. Check ~/.claude-memory/logs/ for logs');
}

install().catch((err) => {
  console.error('Installation failed:', err);
  process.exit(1);
});

