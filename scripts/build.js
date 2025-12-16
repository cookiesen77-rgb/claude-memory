/**
 * Build script - bundles hooks and services for plugin deployment
 */

import { build } from 'esbuild';
import { mkdirSync, copyFileSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

// Output directories
const PLUGIN_DIR = join(ROOT, 'plugin');
const SCRIPTS_DIR = join(PLUGIN_DIR, 'scripts');
const HOOKS_DIR = join(PLUGIN_DIR, 'hooks');

// Ensure directories exist
mkdirSync(SCRIPTS_DIR, { recursive: true });
mkdirSync(HOOKS_DIR, { recursive: true });

// Build configuration
const commonConfig = {
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  sourcemap: false,
  minify: false,
  external: ['better-sqlite3']  // Native module - must be external
};

async function buildAll() {
  console.log('Building claude-memory plugin...\n');

  // 1. Build hooks
  const hooks = [
    'context-hook',
    'new-hook',
    'save-hook',
    'summary-hook',
    'cleanup-hook'
  ];

  for (const hook of hooks) {
    console.log(`  Building ${hook}...`);
    await build({
      ...commonConfig,
      entryPoints: [join(ROOT, 'src', 'hooks', `${hook}.js`)],
      outfile: join(SCRIPTS_DIR, `${hook}.cjs`)
    });
  }

  // 2. Build worker service
  console.log('  Building worker-service...');
  await build({
    ...commonConfig,
    entryPoints: [join(ROOT, 'src', 'services', 'worker-service.js')],
    outfile: join(SCRIPTS_DIR, 'worker-service.cjs')
  });

  // 3. Create hooks.json configuration
  console.log('  Creating hooks.json...');
  const hooksConfig = {
    description: "Claude-memory plugin hooks",
    hooks: {
      SessionStart: [
        {
          matcher: "startup|clear|compact",
          hooks: [
            {
              type: "command",
              command: 'node "${CLAUDE_PLUGIN_ROOT}/scripts/context-hook.cjs"',
              timeout: 30
            }
          ]
        }
      ],
      UserPromptSubmit: [
        {
          hooks: [
            {
              type: "command",
              command: 'node "${CLAUDE_PLUGIN_ROOT}/scripts/new-hook.cjs"',
              timeout: 10
            }
          ]
        }
      ],
      PostToolUse: [
        {
          matcher: "*",
          hooks: [
            {
              type: "command",
              command: 'node "${CLAUDE_PLUGIN_ROOT}/scripts/save-hook.cjs"',
              timeout: 10
            }
          ]
        }
      ],
      Stop: [
        {
          hooks: [
            {
              type: "command",
              command: 'node "${CLAUDE_PLUGIN_ROOT}/scripts/summary-hook.cjs"',
              timeout: 30
            }
          ]
        }
      ],
      SessionEnd: [
        {
          hooks: [
            {
              type: "command",
              command: 'node "${CLAUDE_PLUGIN_ROOT}/scripts/cleanup-hook.cjs"',
              timeout: 5
            }
          ]
        }
      ]
    }
  };

  writeFileSync(
    join(HOOKS_DIR, 'hooks.json'),
    JSON.stringify(hooksConfig, null, 2)
  );

  // 4. Create plugin package.json
  console.log('  Creating plugin package.json...');
  const pluginPackage = {
    name: "claude-memory-plugin",
    version: "1.0.0",
    private: true,
    description: "Runtime dependencies for claude-memory bundled hooks",
    type: "commonjs",
    dependencies: {},
    engines: {
      node: ">=18.0.0"
    }
  };

  writeFileSync(
    join(PLUGIN_DIR, 'package.json'),
    JSON.stringify(pluginPackage, null, 2)
  );

  console.log('\n✓ Build complete!');
  console.log(`  Output: ${PLUGIN_DIR}`);
}

buildAll().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});

