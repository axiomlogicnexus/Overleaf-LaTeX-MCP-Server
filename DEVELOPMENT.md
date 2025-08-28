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
