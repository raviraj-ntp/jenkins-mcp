# Jenkins MCP

A local **Model Context Protocol (MCP) server** that lets AI assistants (Cursor, Claude Desktop, etc.) manage **Jenkins** through structured tools — jobs, builds, logs, artifacts, pipelines, and more.

**No Jenkins plugin required.** This server uses the standard Jenkins REST API.

This repository is **standalone** — clone or publish this folder by itself.

**License:** MIT

---

## Table of contents

- [What does this do?](#what-does-this-do)
- [Who is this for?](#who-is-this-for)
- [How it works](#how-it-works)
- [Prerequisites](#prerequisites)
- [Installation (step by step)](#installation-step-by-step)
- [Getting a Jenkins API token](#getting-a-jenkins-api-token)
- [Configuration](#configuration)
- [Connect to Cursor](#connect-to-cursor)
- [Verify it works](#verify-it-works)
- [Using the tools](#using-the-tools)
- [Tool reference](#tool-reference)
- [npm scripts](#npm-scripts)
- [Security](#security)
- [Troubleshooting](#troubleshooting)
- [Project layout](#project-layout)
- [Publishing](#publishing)

---

## What does this do?

Instead of the AI guessing Jenkins URLs and XML formats, it calls **named tools**:

- `list_jobs` — see jobs in a folder
- `trigger_build` — start a build with parameters
- `get_build_log` — read console output
- `get_test_results` — fetch JUnit results
- `create_or_update_pipeline` — deploy a Jenkinsfile script

**~37 tools** cover health checks, job CRUD, builds, logs, artifacts, queue, SCM, and optional script console.

---

## Who is this for?

- Developers using **Cursor** who debug CI failures with AI help
- DevOps engineers managing Jenkins jobs from chat
- Anyone who wants the AI to read build logs, trigger rebuilds, or inspect job config safely

---

## How it works

```
┌─────────────┐    stdio     ┌──────────────┐    HTTPS    ┌──────────┐
│ Cursor / AI │ ◄──────────► │  jenkins-mcp │ ◄─────────► │ Jenkins  │
│   client    │  (local)     │ (this server)│  (your net) │ (your CI)│
└─────────────┘              └──────────────┘             └──────────┘
```

1. Cursor starts the server as a local subprocess.
2. You ask about a build or job; Cursor calls a Jenkins tool.
3. The server authenticates with your API token and calls Jenkins.
4. Results return as JSON for the AI to interpret.

Runs entirely on your machine. Credentials stay in your `mcp.json` or environment.

---

## Prerequisites

| Requirement | Details |
|-------------|---------|
| **Node.js 20+** | `node --version` |
| **Jenkins** | Any recent version with REST API enabled |
| **API token** | See below (username + token recommended) |
| **Network** | Your machine must reach `JENKINS_URL` |

---

## Installation (step by step)

### 1. Clone and build

```bash
git clone https://github.com/ravi-netapp/jenkins-mcp.git
cd jenkins-mcp
npm install
npm run build
```

### 2. Note your Jenkins URL

Examples:

- `https://jenkins.example.com`
- `http://jenkins.internal:8080`

No trailing slash. Include port if not 443/80.

### 3. Get an API token

See [Getting a Jenkins API token](#getting-a-jenkins-api-token).

### 4. Configure Cursor

See [Connect to Cursor](#connect-to-cursor).

---

## Getting a Jenkins API token

1. Log in to Jenkins in your browser.
2. Click your **username** (top right) → **Configure**.
3. Scroll to **API Token** → **Add new Token**.
4. Copy the token immediately (shown once).
5. Use:
   - `JENKINS_USERNAME` = your Jenkins username
   - `JENKINS_API_TOKEN` = the token you just created

> Use an **API token**, not your login password.

---

## Configuration

### Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JENKINS_URL` | **Yes** | — | Base URL of Jenkins |
| `JENKINS_USERNAME` | Recommended | — | User for HTTP Basic auth |
| `JENKINS_API_TOKEN` | Recommended | — | API token (not password) |
| `JENKINS_ALLOW_SCRIPT_CONSOLE` | No | `false` | Set `true` to enable `run_script_console` |

Auth uses **HTTP Basic**: `username:apiToken` encoded in the `Authorization` header.

If username and token are omitted, the server attempts unauthenticated access (only works if Jenkins allows it).

### Local env file (optional, for terminal testing)

```bash
cp .env.example .env.local
# Edit .env.local — this file is gitignored
source .env.local   # or export vars manually
```

---

## Connect to Cursor

### 1. Edit MCP config

Open `~/.cursor/mcp.json` and add (use your real paths and values):

```json
{
  "mcpServers": {
    "jenkins": {
      "command": "node",
      "args": ["/absolute/path/to/jenkins-mcp/dist/index.js"],
      "env": {
        "JENKINS_URL": "https://jenkins.example.com",
        "JENKINS_USERNAME": "your-username",
        "JENKINS_API_TOKEN": "your-api-token",
        "JENKINS_ALLOW_SCRIPT_CONSOLE": "false"
      }
    }
  }
}
```

### 2. Restart Cursor

Quit and reopen Cursor. Check **Settings → MCP** — `jenkins` should show ~37 tools.

### Dev mode (optional)

```json
"command": "npx",
"args": ["tsx", "/absolute/path/to/jenkins-mcp/src/index.ts"]
```

---

## Verify it works

Ask in Cursor:

> Use `jenkins_health` to check if Jenkins is reachable.

> Use `who_am_i` to show my Jenkins user.

> List jobs in the root folder with `list_jobs`.

---

## Using the tools

### Job names and folders

Jenkins folder jobs use **full names** with slashes:

| Job location | `jobFullName` value |
|--------------|---------------------|
| Root job `my-app` | `my-app` |
| Folder job | `folder/subfolder/my-app` |

### Example prompts

| You ask | Tool the AI may use |
|---------|---------------------|
| "Why did build 42 fail?" | `get_build_log`, `search_build_log` |
| "Trigger a build of deploy-prod" | `trigger_build` |
| "What tests failed?" | `get_test_results` |
| "Show job config for my-pipeline" | `get_job_config` |
| "Replay build 15 with a fix" | `get_replay_scripts`, `replay_build` |

### Example tool inputs

**Trigger build with parameters:**

```json
{
  "jobFullName": "folder/deploy",
  "parameters": {
    "BRANCH": "main",
    "ENV": "staging"
  }
}
```

**Read last 200 lines of console:**

```json
{
  "jobFullName": "my-app",
  "buildNumber": "42",
  "tail": 200
}
```

**Search log for errors:**

```json
{
  "jobFullName": "my-app",
  "buildNumber": "42",
  "pattern": "ERROR|FAILED",
  "maxMatches": 20
}
```

**Create/update a pipeline from script:**

```json
{
  "jobFullName": "my-new-pipeline",
  "script": "pipeline { agent any; stages { stage('Build') { steps { echo 'hi' } } } }",
  "createIfMissing": true
}
```

---

## Tool reference

### Health and system

| Tool | Description |
|------|-------------|
| `jenkins_health` | Ping Jenkins API — use first to verify connectivity |
| `who_am_i` | Show the authenticated Jenkins user |
| `get_status` | Health/readiness summary |
| `get_system_info` | CPU, memory, executor load |
| `list_nodes` | Agents/nodes and executor status |
| `list_plugins` | Installed plugins |

### Jobs

| Tool | Description |
|------|-------------|
| `list_jobs` | List jobs in root or a folder (`folder` param optional) |
| `get_job` | Job metadata (last build, health, etc.) |
| `get_job_config` | Read raw `config.xml` |
| `update_job_config` | Replace `config.xml` |
| `create_job` | Create job from `config.xml` |
| `copy_job` | Duplicate an existing job |
| `delete_job` | Permanently delete a job |
| `enable_job` / `disable_job` | Toggle job enabled state |
| `create_or_update_pipeline` | Create or update a Pipeline job from Groovy script |

### Builds

| Tool | Description |
|------|-------------|
| `trigger_build` | Queue a new build (optional `parameters` map) |
| `get_build` | Build status, duration, result |
| `stop_build` | Abort a running build |
| `rebuild_build` | Re-run with same parameters when supported |
| `update_build` | Change display name or description |
| `get_replay_scripts` | Get Pipeline scripts for replay |
| `replay_build` | Re-run Pipeline with modified script |

### Logs

| Tool | Description |
|------|-------------|
| `get_console` | Progressive console (for streaming/large logs) |
| `get_build_log` | Full log or slice (`start`, `limit`, `tail`) |
| `search_build_log` | Regex search — great for finding errors |

### Tests, SCM, artifacts

| Tool | Description |
|------|-------------|
| `get_test_results` | JUnit XML results for a build |
| `get_build_change_sets` | Commits included in a build |
| `get_job_scm` | SCM configuration from job definition |
| `get_build_scm` | SCM metadata for a specific build |
| `find_jobs_with_scm_url` | Find all jobs using a Git URL fragment |
| `get_artifacts` | List files archived by a build |
| `download_artifact` | Download one artifact (base64, size-limited) |

### Queue

| Tool | Description |
|------|-------------|
| `get_queue` | Everything waiting to build |
| `get_queue_item` | Details for one queued item |
| `cancel_queue_item` | Remove item from queue |

### Advanced

| Tool | Description |
|------|-------------|
| `run_script_console` | Execute Groovy on the controller — **disabled by default**; set `JENKINS_ALLOW_SCRIPT_CONSOLE=true` |

---

## npm scripts

| Command | When to use |
|---------|-------------|
| `npm install` | First time setup |
| `npm run build` | Compile TypeScript → `dist/` |
| `npm run start` | Run server manually |
| `npm run dev` | Development without building |

---

## Security

- **Never commit** `JENKINS_API_TOKEN` to git.
- Use a dedicated Jenkins user with **minimum permissions** needed.
- `run_script_console` runs arbitrary Groovy on the Jenkins controller — keep it **disabled** unless you explicitly need it.
- This server can **create, modify, and delete jobs** and **trigger builds**.
- Prefer read-only Jenkins permissions for exploratory use.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `JENKINS_URL is required` | Missing env in `mcp.json` | Add `JENKINS_URL` to the `env` block |
| 401 Unauthorized | Wrong password used | Use API token, not login password |
| 403 Forbidden | User lacks permission | Grant job/build read or configure permissions |
| CSRF / crumb errors | Jenkins CSRF protection | Server auto-fetches crumbs; ensure user can use API |
| Empty job list | Wrong folder | Pass correct `folder` to `list_jobs` |
| Tools not in Cursor | Bad path | Use absolute path to `dist/index.js`; restart Cursor |
| `run_script_console` fails | Disabled by design | Set `JENKINS_ALLOW_SCRIPT_CONSOLE=true` (use with caution) |

---

## Project layout

```
jenkins-mcp/
├── src/
│   └── index.ts       # Jenkins HTTP client + all MCP tools
├── .env.example       # Template for local testing
├── package.json
├── LICENSE
├── PUBLISHING.md
└── dist/              # Built output (npm run build; gitignored)
```

---

## Publishing

This folder is a complete GitHub repository. See [PUBLISHING.md](./PUBLISHING.md).
