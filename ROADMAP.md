# Overleaf LaTeX MCP Server – Roadmap

This roadmap orders milestones from most relevant and easier to implement to least relevant and more difficult, while including every feature referenced in the provided contexts. Phases are incremental; each can be released as a tagged version. Items are grouped into deliverables with acceptance criteria.

Note: Primary implementation language is TypeScript/Node.js. Optional Python sidecar is used only for LaTeX lint/format and PDF utilities. All features are exposed as MCP tools; selected server capabilities may also have optional HTTP/WebSocket endpoints for ingress/events.


Phase 0.1 – Bootstrap core (foundation, easiest, highest value)
- TypeScript project scaffold
  - package.json, tsconfig.json, src/ with server entry, tool registration, and configuration loader
  - pino structured logging, basic error taxonomy, environment/config validation
- Global security rails (baseline, enforced everywhere)
  - spawn child processes with args only (never shell: true)
  - path containment helper (resolve + workspace root verification, symlink escape blocking)
  - secrets masking in logs; redaction middleware
- Core abstractions (interfaces only, with minimal stubs)
  - CompileProvider (CLSIProvider stub, LocalProvider stub)
  - WorkspaceManager (root-confined workspaces, basic create/resolve)
  - JobQueue (in-memory stub, single worker)
  - ArtifactStore (local disk with TTL metadata stub)
- Initial MCP tools (sync, minimal)
  - get_capabilities (reports providers and policies) [COMPLETED]
  - health.check [COMPLETED]
  - config.show, config.validate, config.reload
- Docs
  - Populate global_rules.md, ARCHITECTURE.md (components and data-flow), API.md (tool schemas draft), DEVELOPMENT.md (dev setup), PRD.md (scope/constraints), CHANGELOG.md (initial)
- .gitignore, initial commit

Acceptance: Server boots; get_capabilities and health.check work; code passes lint/build; docs populated.


Phase 0.2 – Compile path, async model, and artifacts (core robustness)
- Compile pipeline (Local first, minimal)
  - compile_latex (sync) via LocalProvider using latexmk/xelatex; structured diagnostics parsing (basic) [COMPLETED]
  - compile_latex_async with operationId [COMPLETED]; get_compile_status [COMPLETED]; cancel_operation; get_compile_artifact [COMPLETED]
  - Streaming log framing prepared (server-side buffering), return short-lived paths from ArtifactStore (no base64)
- JobQueue
  - In-memory debouncing/coalescing per project; concurrency limit; queue status exposure for ops
- ArtifactStore
  - File-backed store on tmp with TTL cleanup; signed ephemeral URLs (local HTTP handler) [COMPLETED]
- Document intelligence (fast)
  - tex_outline (latex-utensils): sections/labels/citations/environments tree
- File/text utilities
  - get_text_file_contents, patch_text_file_contents (hash-validated, mcp-text-editor semantics) [COMPLETED]
  - text.replace, text.apply_patch (alias/shim for the above)

Acceptance: compile_latex_async compiles a basic project; artifact URLs returned; tex_outline works; patching is hash-validated and safe.


Phase 0.3 – Git-safe editing workflow (LLM-friendly)
- Git wrapper (system git CLI preferred)
  - git_start_session (clone + branch mcp-session/{uuid}) [COMPLETED]
  - git_commit_patch (hash-validated patch apply/commit, conflict detection) [COMPLETED]
  - git_pull_push (fast-forward-only or rebase, per policy) [COMPLETED]
  - Policies: block >10MB binaries; detect LFS; require main.tex; enforce allowedExtensions
- Overleaf project utilities (read/inspect)
  - list_projects (from config) and project metadata [COMPLETED]
  - list_files (extension filter, optional projectName)
  - read_file (workspace-constrained)
  - status_summary (project brief) [COMPLETED]
- Search
  - search_content (regex/text across project with line numbers) [PLANNED]

Acceptance: Safe patch commits on session branches; push respects policy; list_files/read_file/search_content return correct info.


Phase 0.4 – LaTeX preflight and structured edits (accuracy and UX)
- Preflight and quality tools (sidecar optional)
  - tex_preflight (fast checks: missing assets, common pitfalls)
  - tex_lint (chktex) → structured diagnostics; capability-gated
  - tex_format (latexindent) → dry-run + diff and apply; capability-gated
- AST-aware content ops
  - get_sections, get_section_content
  - create_section, insert_paragraph, edit_file_line, delete_section
  - create_document, create_equation, create_table, create_figure
  - analyze_structure (tree of sections, figures, tables, equations)
  - auto_format (formatting using parser + latexindent)
- Bibliography
  - bib_resolve (validate bibliography, report missing entries)
  - generate_bib_entry (generate and insert BibTeX entries)
  - check_refs (undefined/unused labels/citations)

Acceptance: Preflight returns structured issues; section manipulation operates on AST ranges; optional formatting/linting available when sidecar is present.


Phase 0.5 – Overleaf integration surfaces and convenience flows
- CLSI provider
  - CLSIProvider implementation: POST /compile, async status/artifacts where available
- Git integration utilities
  - git_clone_overleaf (clone via Overleaf git remote)
  - git_pull_push (Overleaf remote policies)
  - sync_with_local (two-way sync policy, guarded)
- Build and preview conveniences
  - compile_latex with CLSI; preview_pdf (return artifact URL)
  - git_compile_on_push (push then compile; attach artifacts to operation result)
  - download_from_overleaf, prepare_for_upload (package project for upload)

Acceptance: CLSI compile works when configured; preview_pdf returns a valid URL; Overleaf clones push/pull reliably with auth.


Phase 0.6 – Async events, watch, and live tooling
- Async/eventing standardization
  - operationId pattern across long-running tools; get_operation_status; cancel_operation
  - Server events for operation.updated/final (WS/SSE)
- Watch and forward-search
  - watch.start, watch.stop, watch.list, watch.tail (tail compile logs)
  - forward_search.hint (synctex mapping file/line→page/coords)

Acceptance: Clients can subscribe to compile progress; watch/tail works; basic forward-search mapping implemented.


Phase 0.7 – Security, policy, and sandboxing hardening
- Policy enforcement everywhere (from global_rules.md)
  - shellEscape default off; network off for LocalProvider
  - size/time limits; per-project policies (allowed compilers, extensions, max sizes)
  - pre-receive emulation: forbidden files, line-ending policy, auto-run lint/format gates
- Sandboxed compilation
  - latex.compile_container and latex.clean_container (Docker/WSL); container.info
  - Compile sandbox caps: CPU, MEM, wall time; read-only mounts with tmpfs outputs
- Rate limiting and back-pressure
  - Per-project and global limits; queue depth thresholds

Acceptance: Local compiles run in sandbox with enforced caps; policy violations are blocked with structured errors; rate limits active.


Phase 0.8 – Observability and operations
- Metrics and tracing
  - Prometheus metrics: compile_duration_seconds, queue_depth, compile_memory_bytes, git_sync_errors_total, artifact_store_bytes
  - OpenTelemetry tracing: git, compile, artifact writes; correlation via operationId
- Logs
  - Structured JSON logs with request-id, project-id, operation-id; token masking
- Health and readiness
  - health.check reflects external deps (git/CLSI availability); get_metrics endpoint

Acceptance: Metrics available; traces emitted; health reflects readiness; logs are structured and scrubbed.


Phase 0.9 – Configuration, capability discovery, and dev ergonomics
- Capability discovery
  - get_capabilities returns providers available, sidecar tools availability, limits/policies
- Project workflows
  - project.scaffold (templates); project.detect_root (auto main.tex detection)
  - project.graph (references/includes); project.out_of_date (stale AUX detection)
- Config and governance
  - config.show/validate/reload; Conventional Commits; automated CHANGELOG.md updates
  - dev_generate_api_docs (introspect tool schemas → regenerate API.md)

Acceptance: Capabilities clearly surfaced; dev tooling generates docs; governance practices in place.


Phase 1.0 – Multi-tenant, authZ and production readiness (hardest/high value)
- Multi-tenant RBAC (optional; if added later)
  - Separate read/compile permissions; signed URLs for artifacts; project_id scoping everywhere
- Versioning & rollback
  - Compile from commit SHA; compile previous commit for regression checks
- Artifact/object storage integration
  - S3/MinIO backend with signed URLs; TTL GC
- Deployment
  - Docker images; docker-compose; Helm chart; pre-warmed TeXLive layer
- SLA & docs
  - Supported TeXLive year/package policy; quotas; rate limits; SLA for timeouts and storage
- Auth de-scoping
  - No Auth0/SSO. Git credentials are passed via remote URLs/credential helpers for Overleaf Cloud, or omitted for self-hosted/local.

Acceptance: Secure multi-tenant operation with artifact storage; documented SLA; production deploy artifacts.


Phase 1.x – Advanced/optional features (lower relevance, harder or environment-dependent)
- cite_lookup (Crossref/ADS/DOI to BibTeX)
- pdf.info and pdf.optimize (Python sidecar using pikepdf/qpdf/Ghostscript)
- tex.dist_info, tex.kpsewhich, tex.texdoc, tex.pkg_info
- tex.pkg_install (gated; container-only)
- snippet.insert; files.copy_into_workspace
- session.save, session.restore
- collaborate_merge (guided conflict detection/resolution tooling)
- UI/webhooks integrations (GitHub/GitLab PR hooks → compile + annotate)

Acceptance: Each tool gated by capability and policy; documented with clear security boundaries.


Feature index (traceability to contexts; all features included)
- Core compile/async/artifacts: compile_latex, compile_latex_async, get_compile_status, get_compile_artifact, preview_pdf, cancel_operation, streaming logs
- Workspace/queue/artifacts: WorkspaceManager, JobQueue with debounce, ArtifactStore with TTL and signed URLs
- Git: git_start_session, git_commit_patch, git_pull_push, git_clone_overleaf, git_compile_on_push, sync_with_local, git_propose_merge (optional), merge policy (ff-only/rebase), conflict detection, LFS/large file detection
- Overleaf-like project tools: list_projects, list_files (extension, projectName), read_file, status_summary, download_from_overleaf, prepare_for_upload
- Text/AST operations: get_text_file_contents, patch_text_file_contents, text.replace, text.apply_patch, get_sections, get_section_content, create_section, insert_paragraph, edit_file_line, delete_section, analyze_structure, auto_format, search_content
- LaTeX quality: tex_preflight, tex_outline (AST), tex_lint (chktex), tex_format (latexindent), check_refs, bib_resolve, generate_bib_entry
- Bibliography/citation advanced: cite_lookup (1.x)
- Watch/forward-search: watch.start, watch.stop, watch.list, watch.tail, forward_search.hint
- TeX utilities: tex.dist_info, tex.kpsewhich, tex.texdoc, tex.pkg_info, detect_toolchain
- Containerization: latex.compile_container, latex.clean_container, container.info
- PDF utilities: pdf.info, pdf.optimize (sidecar)
- Config/ops: get_capabilities, config.show, config.validate, config.reload, get_health/health.check, get_metrics
- Governance: dev_generate_api_docs; Conventional Commits, CHANGELOG automation
- Security/policy: path containment helper; shellEscape policy; rate limits; quotas; signed URLs; pre-receive emulation; secrets masking
- Project scaffolding/graphing: project.scaffold, project.detect_root, project.graph, project.out_of_date
- Session utilities: session.save, session.restore, snippet.insert, files.copy_into_workspace
- Optional/gated: tex.pkg_install; texstudio.open (explicitly avoided by default)


Release sequencing notes
- 0.1–0.3 build the safe editing + local compile skeleton
- 0.4–0.6 deliver LaTeX-aware editing, CLSI, and Overleaf flows
- 0.7–0.9 harden security/ops and improve developer experience
- 1.0+ tackles multi-tenant, object storage, and optional advanced features
