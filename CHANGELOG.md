# Changelog

All notable changes to this project will be documented in this file. The format adheres to Conventional Commits.

## [0.1.2] - 2025-08-29
### Changed
- Removed Auth0 authentication to streamline usage for local and self-hosted environments.
- Modified Git session handling to support both token-based authentication for commercial Overleaf instances and token-less access for local setups.

## [0.1.3] - 2025-08-29
### Added
- MCP HTTP bridge endpoints: GET /mcp/tools and POST /mcp/invoke, to list and invoke MCP tools with JSON input validation.
- Compile coalescing: repeated compileAsync calls for the same project/root return the same operationId while a job is queued/running.

### Docs
- API.md and README.md updated with MCP bridge examples and invocation bodies.

## [0.1.2] - 2025-08-28
### Added
- HTTP cancel endpoint: POST /cancel to mark queued/running operations as cancelled.
- Pre-receive emulation in /git/pullPush now includes workspace policy scan results (file size, LFS pointer, binary detection).
- MCP tool registry scaffold and server initialization order fix for safer startup.
- Standardized LaTeX diagnostics codes (latex_error, latex_warning).

### Changed
- ROADMAP.md updated with checkmarks for completed milestones.

### Security
- Startup warning for misconfigured root repo origin and url.*.insteadof rewrite rules.

## [0.1.1] - 2025-08-28
### Added
- LocalProvider: real compile via latexmk/xelatex/pdflatex; safe spawn, timeout, basic diagnostics.
- OperationManager and CompileService for async compile and artifact URL publication.
- HTTP endpoints: /compile, /compileAsync, /compileStatus, /artifacts/:id, /text/get, /text/patch, /files, /projects, /statusSummary, /metrics, /health, /capabilities.
- Policy enforcement: allowedExtensions, allowedCompilers (compile), pre-commit scan for large files and LFS pointers (git commit).
- Git session workflow endpoints: /git/startSession, /git/commitPatch, /git/pullPush.
- Prometheus metrics for compile counters and durations.

### Changed
- Improved LaTeX diagnostics parsing to extract file/line hints.
- API.md updated with Projects endpoints and policy checks.

### Security
- All spawns use args arrays with shell:false.
- Path containment enforced in text tools and workspace manager.

## [0.1.0] - 2025-08-28
### Added
- Initial roadmap (ROADMAP.md) with phased milestones covering compile providers, queue, artifact store, Git workflow, LaTeX intelligence, security, and observability.
- Populated global_rules.md with security rails, policies, language/tooling, return shapes, and observability requirements.
- ARCHITECTURE.md detailing components, data flows, security controls, failure modes, and deployment notes.
- API.md describing MCP tool surface, request/response schemas, async model, and artifact URL handling.
- DEVELOPMENT.md with setup, scripts, coding standards, testing, and release guidance.
- Updated .gitignore to be comprehensive for Node/TS, LaTeX artifacts, logs, and OS/editor files.
