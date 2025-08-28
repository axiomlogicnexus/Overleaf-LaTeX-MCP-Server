# Architecture

This document defines the architecture of the Overleaf LaTeX MCP Server. It is the authoritative reference for components, data flows, security controls, and operational behaviors.

Primary language: TypeScript/Node.js. Optional Python sidecar for LaTeX-specific CLI utilities (chktex, latexindent, PDF tooling) when available.


## Components

- MCP Core (Tool Router)
  - Registers MCP tools and exposes a unified interface to clients.
  - Standardizes request/response shapes and operation lifecycle (sync/async with operationId).

- CompileProvider abstraction
  - Interface that normalizes compilation across backends.
  - Implementations:
    - LocalProvider: Runs latexmk/xelatex in a sandboxed environment (container/WSL preferred). Shell-escape disabled by default.
    - CLSIProvider: Uses Overleaf CLSI HTTP endpoints (sync/async). Maps CLSI responses to unified diagnostics schema.

- WorkspaceManager
  - Creates and manages per-project (and per-session) workspace directories.
  - Enforces path containment. Prevents traversal and symlink escapes.
  - Cleans up inactive workspaces on TTL.

- JobQueue
  - Queues long-running operations (compilation, git sync) with per-project debounce/coalescing.
  - Limits concurrency and exposes queue metrics.
  - In-memory in early phases; pluggable for Redis/BullMQ later.

- ArtifactStore
  - Stores large artifacts (PDF, logs, synctex). Returns short-lived signed URLs.
  - Local disk implementation initially; S3/MinIO pluggable backend later.
  - GC job removes expired artifacts.

- GitClient (system git CLI wrapper)
  - Clones, fetches, rebases, commits, and pushes using `git` subprocess with args arrays only.
  - Session-branch model: `mcp-session/{uuid}`. Never force-push main.
  - Policy checks: block large binaries, require `main.tex`, enforce allowedExtensions.

- Observability
  - Logging: pino JSON logs with request-id, project-id, operation-id.
  - Metrics: Prometheus counters/histograms for compile duration, queue depth, memory, git errors, artifact bytes.
  - Tracing: OpenTelemetry spans for git, compile, artifact writes.

- Python sidecar (optional)
  - Exposes minimal RPC for chktex, latexindent, pdf.info/optimize.
  - Invoked by core; receives normalized paths and bounded inputs.


## Data Flows

1) Compile (async path)
- Client → MCP tool `compile_latex_async` with project descriptor and options.
- MCP returns `operationId`; enqueues job in JobQueue.
- Worker resolves workspace, runs CompileProvider (Local/CLSI), streams logs to a buffer and structured diagnostics.
- On success: store artifacts in ArtifactStore and emit `operation.updated/final` events.
- Client polls `get_compile_status` and fetches artifact via signed URL using `get_compile_artifact` if needed.

2) Safe Editing + Git session
- Client → `git_start_session` clones project and creates `mcp-session/{uuid}` branch.
- Client edits via `patch_text_file_contents` (hash-validated) and `git_commit_patch`.
- Client optionally `git_pull_push` with rebase or fast-forward-only policy.
- Optionally trigger `compile_latex` post-push and attach artifacts to result.

3) LaTeX Intelligence
- Client uses `tex_outline` (latex-utensils) and `analyze_structure` to navigate sections/labels/refs.
- AST-aware edit tools (`create_section`, `delete_section`, `insert_paragraph`, `edit_file_line`) compute ranges and apply validated patches.


## Security Controls

- Path containment helper used everywhere: resolve + workspace root check; reject traversal and symlink escapes.
- Child processes: `spawn(cmd, args, { shell: false })` only. Never `shell: true`.
- Local compiles: network disabled; shell-escape `off` by default; resource caps (wall-time, memory) enforced by sandbox/container where available.
- Policies (per-project): allowed compilers, allowed file extensions, max file size, shell-escape mode, max project size.
- Secrets: loaded from env/secret store; masked in logs; never included in metrics or artifacts.
- Artifact delivery: large payloads never returned inline; only via short-lived signed URLs.
- Zip handling: zip-slip defense, file count/size limits, disallowed extension checks.


## Failure Modes and Handling

- Compile timeout → terminate process tree; return structured error with `timeout` code.
- Memory exceeded → sandbox kill; return `resource_limit_exceeded` diagnostic.
- Git conflicts/divergence → return `conflict` status with guidance; never force push.
- CLSI unavailability → fallback to LocalProvider if policy allows; otherwise return `service_unavailable` with retry hints.
- Artifact store errors → return `artifact_store_error`; do not embed artifacts inline as fallback.
- Sidecar unavailable → gate `tex_lint`/`tex_format`/`pdf.*` tools; keep core operational.


## Configuration

- Environment variables: control logging level, workspace root, artifact TTL, queue concurrency, provider defaults.
- projects.json: per-project configuration (id, name, git URL/credentials, compile provider, policies).
- get_capabilities tool returns available providers and sidecar tools based on runtime detection.


## Deployment Notes

- Early phases run as a single Node process.
- For production: containerize; prefer Docker/WSL for LocalProvider; run with non-root user; mount workspaces read-only and write outputs to tmpfs inside sandbox.
- Provide docker-compose for: API/MCP core, Queue (Redis), Worker(s), Object Storage (MinIO), Prometheus+Grafana.
- Helm chart for Kubernetes; pre-warm TeXLive layer; configure resource requests/limits.


## Windows-specific Considerations

- Prefer containerized compilation and sidecar tools on Windows. If unavailable, gate and report capabilities accurately.
- Normalize paths and encodings to UTF-8; handle BOM if present.
- Use PowerShell for manual ops; scripts should be portable via Node (cross-platform).


## Sequence (Textual)

Compile (LocalProvider)
- Client → compile_latex_async → operationId
- JobQueue → Worker → WorkspaceManager → LocalProvider (spawn latexmk) → parse logs → ArtifactStore
- Emit operation.updated; on completion, emit operation.final with artifact URLs

Git session
- Client → git_start_session → clone + branch
- Client → patch_text_file_contents → git_commit_patch
- Client → git_pull_push (rebase/ff-only)
- Optional: compile_latex post-push and return status
