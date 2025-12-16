# Claude Memory

<p align="center">
  <img src="https://img.shields.io/badge/Claude%20Code-Plugin-blue?style=for-the-badge" alt="Claude Code Plugin">
  <img src="https://img.shields.io/badge/version-1.0.0-green?style=for-the-badge" alt="Version">
  <img src="https://img.shields.io/badge/license-MIT-orange?style=for-the-badge" alt="License">
</p>

<p align="center">
  <strong>🧠 Persistent memory system for Claude Code</strong><br>
  Seamlessly preserve context across sessions - never lose your coding history again.
</p>

---

## ✨ Features

- **📝 Automatic Context Capture** - Records all tool usage, file modifications, and commands
- **💾 Persistent Storage** - SQLite database stores your coding history locally
- **🔄 Smart Context Injection** - Automatically injects relevant history at session start
- **🔍 Full-Text Search** - Search through your entire coding history
- **📊 Token Economics** - Shows how much context is loaded and work investment
- **🏷️ Observation Types** - Categorizes actions as bugfix, feature, refactor, discovery, etc.

## 🚀 Quick Start

### Prerequisites

- Node.js >= 18.0.0
- Claude Code installed (`npm install -g @anthropic-ai/claude-code`)

### Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/claude-memory.git
cd claude-memory

# Install dependencies
npm install

# Build the plugin
npm run build

# Install to Claude Code
npm run install-plugin
```

### Add Local Marketplace (First Time Only)

```bash
# Add the local marketplace to Claude Code
claude plugin marketplace add /Users/YOUR_USERNAME/.claude/plugins/cache/local

# Install the plugin
claude plugin install claude-memory@local
```

## 📖 How It Works

### Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Claude Code   │────▶│   Hook Scripts   │────▶│  Worker Service │
│                 │     │                  │     │   (Express.js)  │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
                                                          ▼
                                                 ┌─────────────────┐
                                                 │  SQLite Database │
                                                 │  (~/.claude-memory)│
                                                 └─────────────────┘
```

### Lifecycle Hooks

| Hook | Trigger | Action |
|------|---------|--------|
| `SessionStart` | Claude Code starts | Inject historical context |
| `UserPromptSubmit` | User sends message | Record session and prompt |
| `PostToolUse` | Tool execution | Capture tool usage as observation |
| `Stop` | Conversation ends | Generate session summary |
| `SessionEnd` | Claude Code exits | Cleanup resources |

### Context Injection Example

When you start Claude Code in a project, you'll see:

```markdown
# [my-project] recent context

📊 **Context Economics**:
- Loading: 15 observations (~120 tokens to read)
- Work investment: ~500 tokens spent on research, building, and decisions

### Tue, Dec 16

| ID | Time | T | Title | File |
|----|------|---|-------|------|
| #1 | 10:30 | 🔴 | Fixed auth bug | src/auth.js |
| #2 | 10:45 | 🟣 | Added login feature | src/login.js |
| #3 | 11:00 | ✅ | Updated config | config.json |

---
**📋 Last Session Summary**
- **Request:** Fix the authentication bug
- **Completed:** Updated token refresh logic
```

## 🛠️ Development

### Project Structure

```
claude-memory/
├── src/
│   ├── hooks/           # Claude Code lifecycle hooks
│   │   ├── context-hook.js    # SessionStart - inject context
│   │   ├── new-hook.js        # UserPromptSubmit - record prompts
│   │   ├── save-hook.js       # PostToolUse - capture tools
│   │   ├── summary-hook.js    # Stop - generate summary
│   │   ├── cleanup-hook.js    # SessionEnd - cleanup
│   │   └── worker-utils.js    # Shared utilities
│   ├── services/
│   │   ├── worker-service.js  # Express API server
│   │   ├── database.js        # SQLite operations
│   │   └── context-generator.js # Context formatting
│   ├── sdk/
│   │   ├── prompts.js         # AI prompt templates
│   │   └── parser.js          # Response parsing
│   └── utils/
│       ├── paths.js           # Path constants
│       └── logger.js          # Logging utility
├── scripts/
│   ├── build.js              # esbuild bundler
│   └── install-plugin.js     # Installation script
├── tests/
│   ├── test-all.js           # Unit tests
│   └── test-e2e.js           # End-to-end tests
└── plugin/                   # Built output directory
```

### Commands

```bash
# Build the plugin
npm run build

# Run unit tests
npm run test

# Run end-to-end tests
npm run test:e2e

# Run all tests
npm run test:all

# Test context injection
npm run test:context

# Worker management
npm run worker:start
npm run worker:stop
npm run worker:restart
npm run worker:status

# Install to Claude Code
npm run install-plugin
```

### API Endpoints

The worker service runs on port `37779` and provides:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/version` | GET | Plugin version |
| `/api/context/inject` | GET | Get context for project |
| `/api/sessions/init` | POST | Initialize new session |
| `/api/sessions/observations` | POST | Store observation |
| `/api/sessions/summarize` | POST | Generate summary |
| `/api/search` | GET | Search observations |
| `/api/observations` | GET | List all observations |
| `/api/projects` | GET | List all projects |

## 📁 Data Storage

All data is stored locally in `~/.claude-memory/`:

```
~/.claude-memory/
├── memory.db          # SQLite database
├── settings.json      # Configuration
└── logs/              # Worker logs
    └── worker-YYYY-MM-DD.log
```

### Configuration

Edit `~/.claude-memory/settings.json`:

```json
{
  "CLAUDE_MEM_WORKER_PORT": 37779,
  "CLAUDE_MEM_CONTEXT_OBSERVATIONS": 50,
  "CLAUDE_MEM_CONTEXT_FULL_COUNT": 5,
  "CLAUDE_MEM_CONTEXT_SESSION_COUNT": 10
}
```

## 🔒 Privacy

- All data is stored **locally** on your machine
- No data is sent to external servers
- Use `<private>` tags to exclude sensitive content from storage

## 🐛 Troubleshooting

### Plugin not loading context

1. Make sure you're in a project directory
2. Trust the workspace when prompted
3. Check worker status: `curl http://localhost:37779/api/health`

### Worker not starting

```bash
# Check if port is in use
lsof -i :37779

# View logs
cat ~/.claude-memory/logs/worker-$(date +%Y-%m-%d).log
```

### Database issues

```bash
# Check database
sqlite3 ~/.claude-memory/memory.db ".tables"

# View recent observations
sqlite3 ~/.claude-memory/memory.db "SELECT * FROM observations ORDER BY id DESC LIMIT 5;"
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

Inspired by [claude-mem](https://github.com/thedotmack/claude-mem) by Alex Newman.

---

<p align="center">
  Made with ❤️ for the Claude Code community
</p>
