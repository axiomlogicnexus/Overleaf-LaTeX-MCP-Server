# Overleaf LaTeX MCP Server

TypeScript/Node.js server that brokers between LLM clients and Overleaf compilation and Git surfaces.

- Primary control plane: HTTP endpoints (MCP tool registration will mirror these in upcoming work)
- Language/runtime: Node.js 20+ with TypeScript
- Security rails: no shell:true, path containment, per-project policies

See ROADMAP.md, ARCHITECTURE.md, API.md, PRD.md, DEVELOPMENT.md, and global_rules.md for details.

## Build and Run

1) Install

```
npm ci
```

2) Build TypeScript to dist/

```
npm run build
```

3) Run server

```
node dist/server.js
```

- Default port: 8080 (set PORT to override)
- Creates/uses top-level directories: `workspaces/` and `artifacts/`

Dev mode (watch):

```
npm run dev
```

## Configuration (projects.json)

Place a `projects.json` file in the repository root to define per-project policies and metadata.

Example (Cloud + local):

```json
{
  "defaultPolicy": {
    "shellEscape": "off",
    "allowedExtensions": [".tex", ".bib", ".png", ".jpg", ".jpeg", ".pdf", ".eps", ".svg", ".txt"],
    "maxFileSizeBytes": 10485760,
    "maxProjectSizeBytes": 209715200,
    "allowedCompilers": ["pdflatex", "xelatex", "latexmk"]
  },
  "projects": {
    "demo": {
      "name": "Demo Project",
      "projectId": "demo",
      "gitUrl": "https://git.overleaf.com/<cloud-project-id>"
    },
    "local-only": {
      "name": "Local Project",
      "projectId": "local-only"
    }
  }
}
```

Notes:
- Do not store tokens in projects.json. For Overleaf Cloud, pass credentials via the remote URL when calling `/git/startSession`, or rely on a credential helper (recommended).
- Self-hosted/local: no tokens required; copy files directly into `workspaces/<projectId>/`.

## Overleaf Cloud vs Self-hosted

- Overleaf Cloud (Git):
  - Use `/git/startSession` with a remote URL embedding credentials:
    `https://<username>:<token>@git.overleaf.com/<project-id>`
  - Commit and push via `/git/commitPatch` and `/git/pullPush`.
- Self-hosted/local:
  - Work directly under `workspaces/<projectId>/` and compile locally.
  - If your Overleaf instance exposes Git, use its remote URL with `/git/startSession`.

## Insomnium Quickstart (copy/paste bodies)

Create an environment:

- base_url: http://localhost:8080
- projectId: demo
- remoteUrl_cloud (optional): https://<username>:<token>@git.overleaf.com/<project-id>

Prepare workspace (local flow):

- Create `workspaces/demo/main.tex` with:

```
\documentclass{article}
\begin{document}
Hello, Overleaf MCP Server.
\section{Intro}
This is a test.
\end{document}
```

A) Compile sync
- POST {{base_url}}/compile
- Body:
{
  "projectId": "{{projectId}}",
  "rootResourcePath": "main.tex",
  "options": { "compiler": "latexmk" }
}
- Expect diagnostics and artifact URLs (pdfUrl/logUrl/synctexUrl). GET the `pdfUrl` to download.

B) Compile async
- POST {{base_url}}/compileAsync
- Body:
{
  "projectId": "{{projectId}}",
  "rootResourcePath": "main.tex",
  "options": { "compiler": "latexmk" }
}
- Then GET {{base_url}}/compileStatus?operationId=<id>

C) Text get
- POST {{base_url}}/text/get
- Body:
{ "projectId": "{{projectId}}", "filePath": "main.tex" }

D) Text patch (hash-validated)
- Compute expectedHash of the segment being replaced (see DEVELOPMENT.md for tips), then:
- POST {{base_url}}/text/patch
- Body:
{
  "projectId": "{{projectId}}",
  "filePath": "main.tex",
  "baseHash": "<sha256-of-full-file>",
  "patches": [
    { "startLine": 5, "endLine": 5, "expectedHash": "<sha256-of-old-lines>", "newText": "This is an edited test." }
  ]
}

E) Git start session
- POST {{base_url}}/git/startSession
- Body (Cloud):
{ "projectId": "{{projectId}}", "remoteUrl": "{{remoteUrl_cloud}}" }

F) Git commit
- POST {{base_url}}/git/commitPatch
- Body:
{ "projectId": "{{projectId}}", "message": "feat: test commit" }
- Policy blocks large files and LFS pointers.

G) Git pull/push
- POST {{base_url}}/git/pullPush
- Body:
{ "projectId": "{{projectId}}", "mode": "ff-only" }

H) Projects and status
- GET {{base_url}}/projects
- GET {{base_url}}/statusSummary?projectId={{projectId}}

I) Health, capabilities, metrics
- GET {{base_url}}/health
- GET {{base_url}}/capabilities
- GET {{base_url}}/metrics

J) Security checks
- Path traversal rejection:
  - POST /text/get with { "projectId": "{{projectId}}", "filePath": "../outside.txt" } → expect error
- Disallowed extension in text ops:
  - Ensure policy disallows extension (e.g., .sh), then POST /text/get with that file → expect error

## LLM Integration (current state)

- The server currently exposes HTTP endpoints; upcoming work will register MCP tools mirroring these endpoints.
- To integrate with an LLM that supports function calling/tools, map your tool definitions to these HTTP endpoints (method + URL + JSON schema) and pass/return structured JSON.
- Once MCP tool registration is added, MCP clients can connect directly without an HTTP shim.

## Next Steps (high level)

- Register MCP tool handlers for: compile, artifacts, text patching, git session, projects, health/capabilities.
- Enhance diagnostics taxonomy (errors/warnings with codes) and file/line extraction.
- Add binary/LFS detection to pre-receive emulation for push.
- Add list_projects and status_summary MCP tools and auto-generate API docs from schemas.

## Notes
- Authentication/SSO (Auth0) is out of scope. For Overleaf Cloud, pass username/token in the remote URL or use OS credential helper.
- For Windows, WSL/Docker is recommended for more consistent LaTeX toolchain behavior.
