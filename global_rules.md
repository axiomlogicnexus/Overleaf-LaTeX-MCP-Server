# Global Rules

These rules apply across the project and must be followed strictly. They are normative for implementation, operations, and documentation.

## Command Preferences
- Use PowerShell for local manual file operations on Windows (more reliable than cmd.exe).
- PowerShell file search: `Get-ChildItem -Path [path] -Recurse -Filter [pattern]`.
- Process killing: `taskkill /F /IM [process.exe]`.
- Use semicolons (;) instead of ampersands (&&) for command chaining in PowerShell.
- SAFETY: Never use deletion commands outside project workspace, unless specifically instructed to. Verify paths and running processes first.

## Language and Tooling
- Primary implementation: TypeScript on Node.js (LTS 20+).
- Package manager: npm (v9+). Lockfile must be committed.
- Lint/format: ESLint (typescript-eslint) and Prettier. TS config must be `"strict": true`.
- MCP server as the core control plane; optional Python sidecar for LaTeX-specific tools (chktex, latexindent, PDF utilities) only.
- Prefer system Git CLI for git operations; invoke via child_process.spawn with args arrays.
- No tool is allowed to invoke a shell. Never set `shell: true`. Always pass arguments as an array.
- Detect external tools (latexmk, xelatex, chktex, latexindent) at runtime and gate features via get_capabilities.

## Security and Safety
- Path containment: For any user-provided path, resolve via `path.resolve` and ensure it remains inside the workspace/project root. Block traversal and symlink escapes.
- Shell escape disabled by default for LaTeX runs; enable only via per-project policy. Emit explicit warnings when enabled and run with stronger sandboxing.
- Resource caps (minimum defaults unless policy overrides):
  - CPU time: 120s wall-time for compiles (kill on timeout).
  - Memory: 512 MiB soft cap, 1 GiB hard cap where supported by sandbox/container.
  - Max project size (uncompressed): 200 MiB.
  - Max single file size for edits/commits: 10 MiB (block or require override).
- Network access: Disabled for LocalProvider compiles by default. CLSI access allowed per deployment.
- Secret handling: Load credentials from environment/secret store. Never log tokens or secrets. Apply log redaction/masking middleware.
- Rate limiting: Apply per-project operation limits and compile debounce to prevent abuse.
- Artifact handling: Never return large artifacts (PDF/log) base64 inline in tool responses. Store in ArtifactStore and return short-lived, signed URLs.
- Zip/Archive safety: Defend against zip-slip on extraction; enforce file count and total size limits; reject disallowed extensions.

## OS and Compatibility
- Primary platform: Windows; also support macOS and Linux.
- Discovery order for binaries: explicit config > PATH lookup > OS fallbacks (Windows registry for MiKTeX/TeX Live; standard paths on macOS; `which` on Linux).
- Prefer Docker/WSL for local compilation/linting on Windows. If unavailable, gate sidecar tools and document degraded capabilities.

## Logging, Diagnostics, and Observability
- Structured JSON logging with pino. Include request-id, project-id, operation-id, and tool name in each log record. Mask secrets.
- Prometheus metrics exposed for: compile_duration_seconds, queue_depth, compile_memory_bytes, git_sync_errors_total, artifact_store_bytes.
- OpenTelemetry tracing spans around git, compile, artifact writes; correlate with operation-id.
- Log streaming: Strip ANSI color codes; emit structured diagnostics separate from raw logs. Do not stream secrets.

## Return Shapes and Error Taxonomy
- All tools return structured responses:
  - `{ status: "ok" | "error", data?: {...}, errors?: [{ code: string, message: string, details?: any }] }`.
- Structured diagnostics for LaTeX logs: `{ severity: "error"|"warning"|"info", file?: string, line?: number, code?: string, message: string }`.
- Normalize CLSI vs. local compile errors into a common schema.

## Code Quality
- TypeScript `strict` mode required. No `any` without justification.
- ESLint + Prettier enforced via CI and pre-commit hooks. Prefer no-floating-promises, explicit return types for public APIs.
- Unit tests for critical helpers: path containment, artifact signing, patch validation, git wrappers.
- Use dependency pinning and `npm audit` checks. Keep third-party usage minimal and vetted.

## Git and Commits
- Conventional Commits (feat, fix, docs, chore, refactor, test, build, ci). Keep CHANGELOG.md updated per release.
- Use session branches for LLM-driven edits: `mcp-session/{uuid}`. Never commit directly to main from automation.
- Merge policy: fast-forward-only or rebase per repo policy; never force-push main.
- Pre-receive emulation: block large binaries (>10 MiB), require presence of `main.tex` (or configured root), enforce allowedExtensions.
- Detect and warn on Git LFS usage; avoid pushing LFS to Overleaf remotes unless explicitly supported.

## Documentation
- Keep API.md aligned with implemented MCP tools and schemas; auto-generate where possible via dev_generate_api_docs.
- Update DEVELOPMENT.md when scripts/workflows change. Document capability gating and platform caveats.
- Keep ARCHITECTURE.md current with component diagram, data-flow, and failure modes.
- PRD.md defines scope and constraints; update when tool surfaces/policies change.

## Policy Enforcement
- All policy checks (shellEscape, allowed extensions, size/time limits) must be enforced in providers and at tool boundaries.
- Capability flags must be respected by clients; server must reject calls to unsupported tools with a structured error.

## MCP and Tooling Conventions
- Tool and endpoint names are namespaced and versioned as needed (e.g., `overleaf.compile.v1`).
- Long-running operations: return operationId; support `get_operation_status` and `cancel_operation`. Emit `operation.updated/final` events where supported.

## Testing and Fixtures
- Maintain representative LaTeX fixtures: article, beamer, thesis, biblatex, minted (shell-escape), TikZ-heavy.
- Golden tests focus on diagnostics and status codes, not binary PDF bytes.

