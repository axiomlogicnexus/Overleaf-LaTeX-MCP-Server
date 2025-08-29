# Development Guide

This guide explains how to build, run, and contribute to the Overleaf LaTeX MCP Server.

## Prerequisites
- Node.js LTS (20+), npm 9+
- Git CLI
- Optional: Docker/WSL (recommended on Windows for LocalProvider sandboxing)
- Optional sidecar tools: chktex, latexindent, Ghostscript/qpdf (for PDF utilities)

## Install
- npm ci
- Ensure `tsconfig.json` has `"strict": true`.

## Scripts (suggested)
- build: `tsc -p tsconfig.json`
- dev: hot-reload using tsx/nodemon
- lint: eslint + prettier
- test: vitest/jest for unit tests
- start: run compiled server

## Project Structure (planned)
- src/
  - server.ts (entry, MCP registration)
  - tools/ (MCP tool handlers)
  - core/
    - providers/ (CompileProvider, LocalProvider, CLSIProvider)
    - workspace/ (WorkspaceManager)
    - queue/ (JobQueue)
    - artifacts/ (ArtifactStore)
    - git/ (GitClient wrapper)
    - security/ (path helpers, policy enforcement)
    - observability/ (logging, metrics, tracing)
  - utils/ (types, zod schemas)
- projects.json (per-project config; DO NOT COMMIT secrets)

## Coding Standards
- See global_rules.md for security and policy requirements.
- TypeScript strict mode; no implicit any; prefer explicit return types.
- Use spawn with args arrays; never `shell: true`.
- Every tool returns `{ status, data?, errors? }`.
- Validate input via zod/JSON Schema; reject invalid requests.

## Testing
- Unit tests for path containment, patch validation, artifact URL signing, Git flows, and diagnostics parsing.
- Golden tests for compile diagnostics (avoid comparing PDF bytes).

## Running Locally
- Start dev server: `npm run dev`
- Invoke MCP tools via your MCP-compatible client.
- On Windows, prefer Docker/WSL for reliable LaTeX/Perl toolchain execution.

## Credentials and Overleaf access
- No Auth0/SSO integration. For Overleaf Cloud Git:
  - Use a remote URL with embedded credentials (username/token) or OS credential helper.
  - Example: `https://<username>:<token>@git.overleaf.com/<project-id>`
- For self-hosted/local use, operate directly in `workspaces/<projectId>` without tokens.

## Quickstart (HTTP endpoints)
Assuming the server runs on port 8080 and your projectId is `demo`:

1) Prepare workspace:
- Create `workspaces/demo/main.tex` and required assets.

2) Compile sync:
- POST http://localhost:8080/compile
  - Body: `{ "projectId": "demo", "rootResourcePath": "main.tex", "options": { "compiler": "latexmk" } }`
  - Response includes diagnostics and artifact URLs.

3) Compile async:
- POST http://localhost:8080/compileAsync → `{ operationId }`
- GET http://localhost:8080/compileStatus?operationId=<id>

4) Fetch artifact:
- GET the `pdfUrl` from the compile response (served via `/artifacts/:id`).

5) Text get/patch:
- POST /text/get with `{ projectId, filePath }`
- POST /text/patch with `{ projectId, filePath, baseHash, patches: [...] }`

6) Git session:
- POST /git/startSession with `{ projectId: "demo", remoteUrl: "https://<user>:<token>@git.overleaf.com/<pid>" }`
- Apply patches locally, then POST /git/commitPatch `{ projectId, message }`
- POST /git/pullPush `{ projectId, mode: "ff-only" }`

7) Project utilities:
- GET /projects → list configured projects
- GET /statusSummary?projectId=demo → quick overview

8) Health/capabilities/metrics:
- GET /health, GET /capabilities, GET /metrics

## Observability
- Logs: pino JSON; include request-id/project-id/operation-id.
- Metrics: expose `/metrics` Prometheus endpoint (optional HTTP mode).
- Tracing: OpenTelemetry configured via env (OTEL_EXPORTER_OTLP_*).

## Release Process
- Conventional Commits; bump version; update CHANGELOG.md.
- Tag releases per roadmap phases.

## Contributing
- Fork and PR with passing CI (lint, build, tests).
- Include docs updates (API.md/ARCHITECTURE.md/ROADMAP.md) when changing tool surfaces.

## Notes
- Respect capability flags; gate sidecar-dependent tools at runtime.
- Avoid embedding large artifacts in responses; always use ArtifactStore URLs.
