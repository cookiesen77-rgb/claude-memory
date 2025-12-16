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

<p align="center">
  <a href="#english">English</a> | <a href="#中文">中文</a>
</p>

---

<a name="english"></a>
## 🇺🇸 English

### ✨ Features

- **📝 Automatic Context Capture** - Records all tool usage, file modifications, and commands
- **💾 Persistent Storage** - SQLite database stores your coding history locally
- **🔄 Smart Context Injection** - Automatically injects relevant history at session start
- **🔍 Full-Text Search** - Search through your entire coding history
- **📊 Token Economics** - Shows how much context is loaded and work investment
- **🏷️ Observation Types** - Categorizes actions as bugfix, feature, refactor, discovery, etc.

### 🚀 Quick Start

#### Prerequisites

- Node.js >= 18.0.0
- Claude Code installed (`npm install -g @anthropic-ai/claude-code`)

#### Installation

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

#### Add Local Marketplace (First Time Only)

```bash
# Add the local marketplace to Claude Code
claude plugin marketplace add ~/.claude/plugins/cache/local

# Install the plugin
claude plugin install claude-memory@local
```

### 📖 How It Works

#### Architecture

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

#### Lifecycle Hooks

| Hook | Trigger | Action |
|------|---------|--------|
| `SessionStart` | Claude Code starts | Inject historical context |
| `UserPromptSubmit` | User sends message | Record session and prompt |
| `PostToolUse` | Tool execution | Capture tool usage as observation |
| `Stop` | Conversation ends | Generate session summary |
| `SessionEnd` | Claude Code exits | Cleanup resources |

#### Context Injection Example

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

### 🛠️ Development

#### Project Structure

```
claude-memory/
├── src/
│   ├── hooks/           # Claude Code lifecycle hooks
│   ├── services/        # Worker service & database
│   ├── sdk/             # Prompt templates & parsers
│   └── utils/           # Shared utilities
├── scripts/             # Build & install scripts
├── tests/               # Unit & E2E tests
└── plugin/              # Built output directory
```

#### Commands

```bash
npm run build          # Build the plugin
npm run test           # Run unit tests
npm run test:e2e       # Run end-to-end tests
npm run install-plugin # Install to Claude Code
npm run worker:status  # Check worker status
```

#### API Endpoints

Worker service runs on port `7777`:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/context/inject` | GET | Get context for project |
| `/api/sessions/init` | POST | Initialize new session |
| `/api/sessions/observations` | POST | Store observation |
| `/api/search` | GET | Search observations |

### 📁 Data Storage

All data is stored locally in `~/.claude-memory/`:

```
~/.claude-memory/
├── memory.db          # SQLite database
├── settings.json      # Configuration
└── logs/              # Worker logs
```

### 🔒 Privacy

- All data is stored **locally** on your machine
- No data is sent to external servers
- Use `<private>` tags to exclude sensitive content

### 🐛 Troubleshooting

**Plugin not loading context?**
1. Make sure you're in a project directory
2. Trust the workspace when prompted
3. Check worker: `curl http://localhost:7777/api/health`

**Worker not starting?**
```bash
lsof -i :7777  # Check if port is in use
cat ~/.claude-memory/logs/worker-$(date +%Y-%m-%d).log  # View logs
```

---

<a name="中文"></a>
## 🇨🇳 中文

### ✨ 功能特性

- **📝 自动捕获上下文** - 记录所有工具使用、文件修改和命令执行
- **💾 持久化存储** - 使用SQLite数据库在本地存储编码历史
- **🔄 智能上下文注入** - 在会话开始时自动注入相关历史记录
- **🔍 全文搜索** - 搜索整个编码历史
- **📊 Token经济** - 显示加载的上下文量和工作投入
- **🏷️ 观察类型** - 将操作分类为bugfix、feature、refactor、discovery等

### 🚀 快速开始

#### 前置要求

- Node.js >= 18.0.0
- 已安装Claude Code (`npm install -g @anthropic-ai/claude-code`)

#### 安装步骤

```bash
# 克隆仓库
git clone https://github.com/YOUR_USERNAME/claude-memory.git
cd claude-memory

# 安装依赖
npm install

# 构建插件
npm run build

# 安装到Claude Code
npm run install-plugin
```

#### 添加本地市场（仅首次需要）

```bash
# 将本地市场添加到Claude Code
claude plugin marketplace add ~/.claude/plugins/cache/local

# 安装插件
claude plugin install claude-memory@local
```

### 📖 工作原理

#### 架构图

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Claude Code   │────▶│    Hook脚本      │────▶│   Worker服务    │
│                 │     │                  │     │   (Express.js)  │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
                                                          ▼
                                                 ┌─────────────────┐
                                                 │   SQLite数据库   │
                                                 │ (~/.claude-memory)│
                                                 └─────────────────┘
```

#### 生命周期钩子

| 钩子 | 触发时机 | 动作 |
|------|----------|------|
| `SessionStart` | Claude Code启动 | 注入历史上下文 |
| `UserPromptSubmit` | 用户发送消息 | 记录会话和提示 |
| `PostToolUse` | 工具执行后 | 捕获工具使用作为观察 |
| `Stop` | 对话结束 | 生成会话摘要 |
| `SessionEnd` | Claude Code退出 | 清理资源 |

#### 上下文注入示例

当您在项目中启动Claude Code时，会看到：

```markdown
# [我的项目] 最近上下文

📊 **上下文经济**:
- 加载: 15个观察 (~120 tokens)
- 工作投入: ~500 tokens用于研究、构建和决策

### 周二, 12月16日

| ID | 时间 | 类型 | 标题 | 文件 |
|----|------|------|------|------|
| #1 | 10:30 | 🔴 | 修复认证bug | src/auth.js |
| #2 | 10:45 | 🟣 | 添加登录功能 | src/login.js |
| #3 | 11:00 | ✅ | 更新配置 | config.json |

---
**📋 上次会话摘要**
- **请求:** 修复认证bug
- **完成:** 更新了token刷新逻辑
```

### 🛠️ 开发指南

#### 项目结构

```
claude-memory/
├── src/
│   ├── hooks/           # Claude Code生命周期钩子
│   ├── services/        # Worker服务和数据库
│   ├── sdk/             # 提示模板和解析器
│   └── utils/           # 共享工具
├── scripts/             # 构建和安装脚本
├── tests/               # 单元测试和端到端测试
└── plugin/              # 构建输出目录
```

#### 命令

```bash
npm run build          # 构建插件
npm run test           # 运行单元测试
npm run test:e2e       # 运行端到端测试
npm run install-plugin # 安装到Claude Code
npm run worker:status  # 检查worker状态
```

#### API端点

Worker服务运行在端口 `7777`：

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/health` | GET | 健康检查 |
| `/api/context/inject` | GET | 获取项目上下文 |
| `/api/sessions/init` | POST | 初始化新会话 |
| `/api/sessions/observations` | POST | 存储观察 |
| `/api/search` | GET | 搜索观察 |

### 📁 数据存储

所有数据本地存储在 `~/.claude-memory/`：

```
~/.claude-memory/
├── memory.db          # SQLite数据库
├── settings.json      # 配置文件
└── logs/              # Worker日志
```

### 🔒 隐私说明

- 所有数据**仅存储在本地**
- 不会向外部服务器发送任何数据
- 使用 `<private>` 标签排除敏感内容

### 🐛 故障排除

**插件没有加载上下文？**
1. 确保您在项目目录中
2. 当提示时信任工作区
3. 检查worker：`curl http://localhost:7777/api/health`

**Worker无法启动？**
```bash
lsof -i :7777  # 检查端口是否被占用
cat ~/.claude-memory/logs/worker-$(date +%Y-%m-%d).log  # 查看日志
```

---

## 🤝 Contributing / 贡献

Contributions are welcome! Please feel free to submit a Pull Request.

欢迎贡献！请随时提交Pull Request。

## 📄 License / 许可证

MIT License - see [LICENSE](LICENSE) for details.

MIT许可证 - 详见 [LICENSE](LICENSE)。

## 🙏 Acknowledgments / 致谢

Inspired by [claude-mem](https://github.com/thedotmack/claude-mem) by Alex Newman.

灵感来自 Alex Newman 的 [claude-mem](https://github.com/thedotmack/claude-mem)。

---

<p align="center">
  Made with ❤️ for the Claude Code community<br>
  为 Claude Code 社区用 ❤️ 打造
</p>
