# Jenkins MCP

Local MCP server for **Jenkins** — ~37 tools for jobs, builds, logs, artifacts, and pipelines. Uses the Jenkins REST API; **no Jenkins plugin** required.

- Runs on **your machine**
- **npm:** `@raviraj87/jenkins-mcp` — https://www.npmjs.com/package/@raviraj87/jenkins-mcp
- **GitHub:** https://github.com/raviraj-ntp/jenkins-mcp

---

## Quick start (npm — recommended)

Edit `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "jenkins": {
      "command": "npx",
      "args": ["-y", "@raviraj87/jenkins-mcp"],
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

Restart Cursor. Ask: *"Use jenkins_health"*.

## Install from source (optional)

```bash
git clone https://github.com/raviraj-ntp/jenkins-mcp.git
cd jenkins-mcp
npm install
npm run build
```

Use `"command": "node"`, `"args": ["<<YOUR_CLONE_PATH>>/jenkins-mcp/dist/index.js"]` in `mcp.json`.

---

## What you customize on each machine

| What | Where | Notes |
|------|--------|-------|
| Server | `mcp.json` | **npm:** `npx` + `@raviraj87/jenkins-mcp` — **or** `node` + clone path |
| `JENKINS_URL` | `env` | Your Jenkins URL (no trailing `/`) |
| `JENKINS_USERNAME` / `JENKINS_API_TOKEN` | `env` | API token, not password |

---

## Get a Jenkins API token

1. Jenkins → your **username** (top right) → **Configure**
2. **API Token** → **Add new Token** → copy it immediately

---

## Cursor setup

**npm (recommended):**

```json
{
  "mcpServers": {
    "jenkins": {
      "command": "npx",
      "args": ["-y", "@raviraj87/jenkins-mcp"],
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

**From source:**

```json
"command": "node",
"args": ["<<YOUR_CLONE_PATH>>/jenkins-mcp/dist/index.js"]
```

Restart Cursor. Check **Settings → MCP** for ~37 tools.

### Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JENKINS_URL` | Yes | — | Jenkins base URL |
| `JENKINS_USERNAME` | Recommended | — | For HTTP Basic auth |
| `JENKINS_API_TOKEN` | Recommended | — | API token |
| `JENKINS_ALLOW_SCRIPT_CONSOLE` | No | `false` | Set `true` only to enable `run_script_console` |
| `NODE_EXTRA_CA_CERTS` | No | — | PEM of an internal CA. Node reads this at process start |
| `JENKINS_NO_SSL_VERIFY` | No | `false` | Skip TLS verification for this process. Use for a self-signed or expired controller cert |

---

## Verify

In Cursor:

> Use `jenkins_health` to check Jenkins.

> Use `who_am_i` for my Jenkins user.

> List jobs with `list_jobs`.

---

## Using tools

**Job names:** use full path — root job `my-app`, folder job `folder/subfolder/my-app`.

| You ask | Tool |
|---------|------|
| Why did build 42 fail? | `get_build_log`, `search_build_log` |
| Trigger a build | `trigger_build` |
| Test failures? | `get_test_results` |
| Replay a pipeline | `get_replay_scripts`, `replay_build` |

---

## Tool reference

### Health & system
`jenkins_health`, `who_am_i`, `get_status`, `get_system_info`, `list_nodes`, `list_plugins`

### Jobs
`list_jobs`, `get_job`, `get_job_config`, `update_job_config`, `create_job`, `copy_job`, `delete_job`, `enable_job`, `disable_job`, `create_or_update_pipeline`

### Builds
`trigger_build`, `get_build`, `stop_build`, `rebuild_build`, `update_build`, `get_replay_scripts`, `replay_build`

### Logs
`get_console`, `get_build_log`, `search_build_log`

### Tests, SCM, artifacts
`get_test_results`, `get_build_change_sets`, `get_job_scm`, `get_build_scm`, `find_jobs_with_scm_url`, `get_artifacts`, `download_artifact`

### Queue
`get_queue`, `get_queue_item`, `cancel_queue_item`

### Advanced
`run_script_console` — **disabled by default**; dangerous Groovy on controller

---

## npm scripts

| Command | Purpose |
|---------|---------|
| `npm install` | Install dependencies |
| `npm run build` | Build `dist/` |
| `npm run dev` | Run with `tsx` (no build) |

---

## Security

- Never commit `JENKINS_API_TOKEN`.
- Keep `JENKINS_ALLOW_SCRIPT_CONSOLE=false` unless you explicitly need script console.
- Prefer `NODE_EXTRA_CA_CERTS` over `JENKINS_NO_SSL_VERIFY`. The skip flag disables certificate checks for every HTTPS call in this process.
- Server can create/delete jobs and trigger builds — use a limited-permission Jenkins user.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `JENKINS_URL is required` | Add to `mcp.json` `env` |
| `fetch failed` / `CERT_HAS_EXPIRED` / untrusted certificate | Node hides the TLS cause behind `fetch failed`. Trust the CA with `NODE_EXTRA_CA_CERTS`, or set `JENKINS_NO_SSL_VERIFY=true` for a self-signed or expired controller cert |
| 401 Unauthorized | Use API token, not password |
| 403 Forbidden | Grant Jenkins permissions to API user |
| Tools missing | Fix `args` path; `npm run build`; restart Cursor |

---

## License

Copyright © 2026 Ravi Raj. Licensed under the [MIT License](LICENSE).
