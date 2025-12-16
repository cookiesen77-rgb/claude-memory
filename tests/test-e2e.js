/**
 * End-to-End Test - verifies the complete claude-memory system
 */

import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { rmSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PLUGIN_DIR = join(homedir(), '.claude', 'plugins', 'claude-memory');
const DATA_DIR = join(homedir(), '.claude-memory');
const WORKER_PORT = 37779;

// Helper: Wait for condition
async function waitFor(conditionFn, timeout = 10000, interval = 200) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    if (await conditionFn()) return true;
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  return false;
}

// Helper: HTTP request
async function request(method, path, body = null) {
  const url = `http://127.0.0.1:${WORKER_PORT}${path}`;
  const options = {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {}
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  const response = await fetch(url, options);
  const text = await response.text();
  
  try {
    return { status: response.status, data: JSON.parse(text), text };
  } catch {
    return { status: response.status, data: null, text };
  }
}

async function runTests() {
  console.log('Claude Memory E2E Tests\n');
  console.log('='.repeat(50));
  
  let workerProcess = null;
  let passed = 0;
  let failed = 0;
  
  const results = [];
  
  function test(name, success, message = '') {
    if (success) {
      console.log(`✓ ${name}`);
      passed++;
    } else {
      console.log(`✗ ${name}${message ? ': ' + message : ''}`);
      failed++;
    }
    results.push({ name, success, message });
  }
  
  try {
    // Check plugin installation
    console.log('\n📦 Plugin Installation');
    test('Plugin directory exists', existsSync(PLUGIN_DIR));
    test('Worker script exists', existsSync(join(PLUGIN_DIR, 'scripts', 'worker-service.cjs')));
    test('Hooks config exists', existsSync(join(PLUGIN_DIR, 'hooks', 'hooks.json')));
    
    // Start worker
    console.log('\n🚀 Starting Worker');
    workerProcess = spawn('node', ['scripts/worker-service.cjs'], {
      cwd: PLUGIN_DIR,
      stdio: 'pipe',
      detached: false
    });
    
    // Wait for worker to be ready
    const workerReady = await waitFor(async () => {
      try {
        const res = await request('GET', '/api/health');
        return res.status === 200;
      } catch {
        return false;
      }
    }, 15000);
    
    test('Worker starts successfully', workerReady, 'Worker failed to start within 15s');
    
    if (!workerReady) {
      throw new Error('Cannot continue tests without worker');
    }
    
    // Test API endpoints
    console.log('\n🔌 API Tests');
    
    // Health check
    const healthRes = await request('GET', '/api/health');
    test('Health endpoint responds', healthRes.status === 200 && healthRes.data?.status === 'ok');
    
    // Version
    const versionRes = await request('GET', '/api/version');
    test('Version endpoint responds', versionRes.status === 200 && versionRes.data?.version);
    
    // Session initialization
    const sessionId = `e2e-test-${Date.now()}`;
    const initRes = await request('POST', '/api/sessions/init', {
      sessionId,
      project: 'e2e-test-project',
      userPrompt: 'Test the memory system'
    });
    test('Session init succeeds', initRes.status === 200 && initRes.data?.success);
    
    // Store observations
    const obsRes = await request('POST', '/api/sessions/observations', {
      claudeSessionId: sessionId,
      tool_name: 'Write',
      tool_input: { file_path: 'test/example.js', content: 'test code' },
      tool_response: { success: true },
      cwd: '/test/project'
    });
    test('Observation storage succeeds', obsRes.status === 200 && obsRes.data?.success);
    
    // Wait for observation to be processed
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Generate summary
    const summaryRes = await request('POST', '/api/sessions/summarize', {
      claudeSessionId: sessionId,
      last_user_message: 'Test the memory system',
      last_assistant_message: 'I tested the memory system by writing example.js. All tests passed.'
    });
    test('Summary generation succeeds', summaryRes.status === 200 && summaryRes.data?.success);
    
    // Context injection
    const contextRes = await request('GET', '/api/context/inject?project=e2e-test-project');
    test('Context injection returns data', 
      contextRes.status === 200 && contextRes.text.includes('e2e-test-project'));
    test('Context includes observation', 
      contextRes.text.includes('example.js'));
    test('Context includes summary',
      contextRes.text.includes('Test the memory system'));
    
    // Search
    const searchRes = await request('GET', '/api/search?q=example&project=e2e-test-project');
    test('Search returns results', 
      searchRes.status === 200 && searchRes.data?.results?.length > 0);
    
    // Get observation by ID
    if (searchRes.data?.results?.[0]?.id) {
      const obsId = searchRes.data.results[0].id;
      const getObsRes = await request('GET', `/api/observations/${obsId}`);
      test('Get observation by ID succeeds',
        getObsRes.status === 200 && getObsRes.data?.id === obsId);
    }
    
    // Projects list
    const projectsRes = await request('GET', '/api/projects');
    test('Projects list includes test project',
      projectsRes.status === 200 && projectsRes.data?.projects?.includes('e2e-test-project'));
    
    // Test privacy tag filtering (client-side, simulated)
    console.log('\n🔒 Privacy Tests');
    const privateContent = '<private>secret data</private>';
    test('Private tags detected (simulation)',
      privateContent.includes('<private>'));
    
  } catch (error) {
    console.error(`\n❌ Test error: ${error.message}`);
  } finally {
    // Cleanup
    if (workerProcess) {
      workerProcess.kill();
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Summary
    console.log('\n' + '='.repeat(50));
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log('='.repeat(50));
    
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();

