![CloudBrain](cloudbrain.png)

# CloudBrain 2.0

An autonomous multi-agent AI system that runs on your VPS, manages your Cloudflare infrastructure through natural language, and gets smarter the more you use it. Talk to it via Telegram, Discord, or WhatsApp — it runs forever in the background until you stop it.

## What It Does

- **Runs as a Daemon** — Starts in background, survives terminal close, runs until machine shuts down
- **Remembers Everything** — Learns your name, preferences, projects, patterns from every interaction
- **Multi-Agent System** — 5 specialized skill agents (Coder, Deployer, Searcher, Scheduler, FileManager)
- **Action-Oriented** — Executes tasks instead of just talking about them
- **Manages Cloudflare** — Workers, KV, D1, R2, DNS, Domains via Wrangler
- **Multi-Channel** — Telegram, Discord, WhatsApp + CLI shell
- **AI Powered** — Text, image generation, audio transcription via Workers AI
- **Scheduled Tasks** — Cron-based heartbeat system for recurring automations
- **Built-in Search** — No API keys needed, uses DuckDuckGo
- **Local Code Execution** — Writes and runs code locally, deploys to Cloudflare
- **Permission System** — Asks before destructive operations
- **Zero-Config Database** — Embedded SQLite, no external server

![Cloudbrain V2](Cloudbrain-v2.png)

## Requirements

- Node.js 18+
- Cloudflare account with API token
- At least one channel: Telegram bot token, Discord bot token, or WhatsApp Cloud API

## Install

```bash
git clone https://github.com/truehannan/cloudbrain.git
cd cloudbrain
npm install
npm link   # Makes 'cloudbrain' command available globally
```

## Setup

```bash
cloudbrain setup
```

The wizard will:
1. Automatically create an embedded SQLite database at `~/.cloudbrain/cloudbrain.db`
2. Ask for Cloudflare Account ID + API Token
3. Ask for channel credentials (Telegram/Discord/WhatsApp)
4. Auto-provision D1 database and verify Workers AI access

No external database server needed — everything is self-contained.

## Usage

### Start the Agent (Background Daemon)

```bash
cloudbrain start
```

This spawns a background process that **runs forever** until you stop it or the machine shuts down. Closing the terminal does NOT stop it.

### Stop / Restart

```bash
cloudbrain stop       # Stop the daemon
cloudbrain restart    # Stop + start
```

### Run in Foreground (for debugging)

```bash
cloudbrain start --foreground
```

### Other Commands

```bash
cloudbrain status     # Show daemon status (running/stopped, PID)
cloudbrain logs       # Show recent log output
cloudbrain logs -f    # Follow logs in real-time
cloudbrain tasks      # View scheduled tasks
cloudbrain channels   # View configured channels
cloudbrain deploy     # Deploy a worker
cloudbrain setup      # Re-run setup wizard
cloudbrain shell      # Interactive CLI
```

## Multi-Agent Architecture

CloudBrain uses 5 specialized skill agents coordinated by a Planner:

| Agent | Skill | What It Does |
|-------|-------|-------------|
| **Coder** | Code & Commands | Writes code, runs shell commands, manages `~/.cloudbrain/workspace/` |
| **Deployer** | Cloudflare | Workers, KV, D1, R2, DNS — all via Wrangler |
| **Searcher** | Web & Local | DuckDuckGo search + local file grep |
| **Scheduler** | Cron Tasks | Creates/manages recurring automated tasks |
| **FileManager** | Files | Create, read, delete, move local files |

### How It Works

1. **Message arrives** (Telegram/Discord/WhatsApp/CLI)
2. **Planner Agent** analyzes intent, splits multi-step requests, assigns to skill agents
3. **Executor** dispatches to the correct skill agent
4. **Skill Agent** performs the action (runs code, deploys, searches, etc.)
5. **Result returned** — concise, action-oriented (no fluff)
6. **Context stored** — conversation, facts, preferences all persisted for next time

## Memory & Learning

CloudBrain automatically learns from every interaction:

- **Explicit memories** — "remember that my server IP is 1.2.3.4"
- **Auto-detected facts** — name, timezone, projects mentioned
- **Preferences** — tools, languages, deployment patterns you use
- **Usage patterns** — what commands you run most often

Next time you interact, it already knows your context.

## What You Can Say

### Cloudflare Management
```
"list my workers"
"deploy worker my-api"
"create kv namespace cache"
"create database users"
"create bucket media"
"delete worker old-one"
```

### Code & Commands
```
"write a script that fetches weather data"
"run command: ls -la"
"npm install express"
"git clone https://github.com/user/repo"
```

### File Operations
```
"create file config.json"
"read file index.js"
"list files"
"delete file old-script.js"
```

### Web Search (Built-in, No API Key)
```
"search for latest Node.js release"
"look up cloudflare workers pricing"
```

### Scheduling
```
"send me news at 9am every day"
"run backup at midnight"
"check system status every hour"
```

### Memory
```
"remember that my deploy branch is production"
"my name is Alex"
"I prefer TypeScript over JavaScript"
"what do you remember about me?"
```

### Multi-Step
```
"search for express.js docs then write a hello world server"
"create a worker called api then deploy it"
```

## Architecture

```
┌──────────────────────────────────────────────────┐
│                 CLI + Daemon                      │
│  cloudbrain start | stop | restart | status       │
└──────────────────────┬───────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────┐
│              AGENT CORE (index.ts)               │
│    Message → Context → Plan → Execute → Learn    │
└─────┬──────────┬──────────┬──────────┬───────────┘
      │          │          │          │
┌─────▼────┐┌───▼────┐┌────▼───┐┌─────▼──────┐
│ Channels ││Planner ││Context ││ Permission │
│Telegram  ││ Agent  ││Manager ││  Manager   │
│Discord   ││        ││Memory  ││            │
│WhatsApp  ││        ││Learning││            │
└─────┬────┘└───┬────┘└────┬───┘└────────────┘
      │         │          │
┌─────▼─────────▼──────────▼────────────────────┐
│            SKILL REGISTRY                     │
│  ┌────────┐ ┌─────────┐ ┌──────────┐         │
│  │ Coder  │ │Deployer │ │ Searcher │         │
│  │Code/Run│ │CF/Wrnglr│ │DuckDuckGo│         │
│  └────────┘ └─────────┘ └──────────┘         │
│  ┌──────────┐ ┌─────────────┐                │
│  │Scheduler │ │ FileManager │                │
│  │  Cron    │ │  Local FS   │                │
│  └──────────┘ └─────────────┘                │
└───────────────────────┬───────────────────────┘
                        │
┌───────────────────────▼───────────────────────┐
│         SQLite Database (embedded)            │
│  credentials | conversations | memories       │
│  user_preferences | user_facts | task_log     │
│  scheduled_tasks | system_config | permissions│
└───────────────────────┬───────────────────────┘
                        │
          ┌─────────────▼─────────────┐
          │     Cloudflare (Remote)   │
          │  Workers | KV | D1 | R2   │
          │  DNS | Zones | AI | Pages │
          └───────────────────────────┘
```

## Data Storage

| Data | Where | Purpose |
|------|-------|---------|
| Credentials | `~/.cloudbrain/cloudbrain.db` | API tokens, never leaves machine |
| Conversations | SQLite | Context for AI responses |
| Memories | SQLite | Explicit "remember X" items |
| User Facts | SQLite | Auto-learned info about you |
| Preferences | SQLite | Your patterns and choices |
| Scheduled Tasks | SQLite | Survives restarts |
| Daemon PID | `~/.cloudbrain/cloudbrain.pid` | Process tracking |
| Daemon Logs | `~/.cloudbrain/cloudbrain.log` | Runtime output |
| Workspace | `~/.cloudbrain/workspace/` | Code written by Coder agent |

## Development

```bash
npm run dev              # Run with ts-node (no build)
npm run build            # Compile TypeScript to dist/
cloudbrain start --foreground   # Run in foreground for debugging
```

## License

See LICENSE file.
