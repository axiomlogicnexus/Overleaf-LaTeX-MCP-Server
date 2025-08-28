# Changelog

All notable changes to this project will be documented in this file. The format adheres to Conventional Commits.

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
