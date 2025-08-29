# API Surface

This document describes the MCP tool surface and optional HTTP endpoints used by the Overleaf LaTeX MCP Server. All tools return structured responses:

- Success: `{ status: "ok", data: { ... } }`
- Error: `{ status: "error", errors: [{ code: string, message: string, details?: any }] }`

Long-running tools return `{ operationId }` and progress is available via `get_operation_status`. The server emits `operation.updated` and `operation.final` events when supported.

All file paths are workspace-relative; the server enforces path containment and policy checks. Large artifacts (PDF/log/synctex) are delivered via short-lived signed URLs from the ArtifactStore.

## Authentication & credentials

- No Auth0/SSO usage. This server does not implement third-party identity providers.
- Overleaf Cloud Git access:
  - Supply a remote URL including credentials or use a credential helper. Example: https://<username>:<token>@git.overleaf.com/<project-id>
  - Never log tokens; the server masks secrets in logs. Prefer OS credential stores.
- Self-hosted/local:
  - Git tokens are not required if you operate on local workspaces (workspaces/<projectId>). You can copy project files directly.
- Configuration:
  - projects.json may include per-project gitUrl (remote) and projectId. Tokens are not stored; pass via URL or OS credential store at clone time.

## Core

- get_capabilities
  - Input: none
  - Output: `{ providers: string[], tools: { tex_lint?: boolean, tex_format?: boolean, pdf_tools?: boolean }, policies: {...}, limits: {...} }`

- health.check
  - Input: none
  - Output: `{ healthy: boolean, checks: { git?: boolean, clsi?: boolean, workspace?: boolean, artifactStore?: boolean } }`

- config.show | config.validate | config.reload
  - Input: optional section/filter
  - Output: current config/policy or validation report

## Compile (Local/CLSI via CompileProvider)

- compile_latex
  - Input: `{ projectId: string, rootResourcePath?: string, compiler?: "pdflatex"|"xelatex"|"lualatex"|"latexmk", outputFormat?: "pdf"|"dvi"|"ps", options?: { synctex?: boolean, shellEscape?: "off"|"restricted"|"on", timeoutMs?: number } }`
  - Output: `{ diagnostics: Diagnostic[], artifacts: { pdfUrl?: string, logUrl?: string, synctexUrl?: string } }`

- compile_latex_async
  - Input: same as compile_latex
  - Output: `{ operationId: string }`

- get_compile_status
  - Input: `{ operationId: string }`
  - Output: `{ state: "queued"|"running"|"succeeded"|"failed"|"cancelled", progress?: number, diagnostics?: Diagnostic[], artifacts?: { pdfUrl?: string, logUrl?: string, synctexUrl?: string } }`

- cancel_operation (HTTP: POST /cancel)
  - Input: `{ operationId: string }`
  - Output: `{ cancelled: boolean }`
  - Notes: If operation is queued or running, it will be marked as cancelled. Completed/failed operations are unchanged and return `cancelled: false`.

- get_compile_artifact
  - Input: `{ operationId?: string, type: "pdf"|"log"|"synctex"|"aux", path?: string }`
  - Output: `{ url: string, expiresAt: string }`

Diagnostic shape:
`{ severity: "error"|"warning"|"info", file?: string, line?: number, code?: string, message: string }`

## Workspace and Text Editing

- get_text_file_contents
  - Input: `{ projectId: string, filePath: string, ranges?: { start: number, end: number }[] }`
  - Output: `{ filePath: string, content: string, encoding: "utf-8" }`

- patch_text_file_contents
  - Input: `{ projectId: string, filePath: string, baseHash: string, patches: Patch[] }`
  - Output: `{ filePath: string, newHash: string }`

Patch shape (hash-validated, mcp-text-editor style):
`{ startLine: number, endLine: number, expectedHash: string, newText: string }`

- text.replace | text.apply_patch
  - Aliases/shims for patch_text_file_contents with simplified input.

## LaTeX Intelligence and Structure

- tex_outline
  - Input: `{ projectId: string, root: string }`
  - Output: `{ outline: OutlineNode[] }`

- analyze_structure
  - Input: `{ projectId: string, root: string }`
  - Output: `{ sections: SectionNode[], figures: Node[], tables: Node[], equations: Node[] }`

- get_sections | get_section_content
  - Input: `{ projectId: string, filePath: string, sectionTitle?: string }`
  - Output: `{ sections: SectionNode[] }` or `{ section: SectionNode, content: string }`

- create_section | insert_paragraph | edit_file_line | delete_section | create_document | create_equation | create_table | create_figure | fix_errors
  - Input: operation-specific; all return updated hashes and ranges modified.

- auto_format
  - Input: `{ projectId: string, paths: string[], mode: "dry-run"|"apply" }`
  - Output: `{ diffs: Diff[], applied?: boolean }`

## LaTeX Quality and Bibliography

- tex_preflight
  - Input: `{ projectId: string, root: string }`
  - Output: `{ issues: Diagnostic[] }`

- tex_lint (capability-gated)
  - Input: `{ projectId: string, root: string, rules?: any }`
  - Output: `{ diagnostics: Diagnostic[] }`

- tex_format (capability-gated)
  - Input: `{ projectId: string, paths: string[], mode: "dry-run"|"apply" }`
  - Output: `{ diffs: Diff[], applied?: boolean }`

- bib_resolve | check_refs
  - Input: `{ projectId: string, root: string }`
  - Output: `{ missing: string[], unused: string[], duplicates?: string[] }`

- generate_bib_entry
  - Input: `{ projectId: string, bibPath: string, metadata: any }`
  - Output: `{ entry: string, inserted: boolean }`

## Projects

- list_projects
  - Input: none
  - Output: `{ projects: { key: string, name: string, projectId: string }[] }`

- status_summary
  - Input: `{ projectId: string }`
  - Output: `{ projectId, hasMainTex: boolean, fileCount: number, counts: { tex, bib, images, pdf, other }, git: { isRepo: boolean, branch?: string, head?: string } }`

## Git and Overleaf Integration

- list_projects | list_files | read_file | status_summary
  - Inputs: project and filter parameters; outputs: metadata and file listings/contents.

- git_start_session
  - Input: `{ projectId: string, remoteUrl: string, auth?: { username?: string, token?: string }, branch?: string }`
  - Output: `{ branch: string, path: string }`

- git_commit_patch
  - Input: `{ projectId: string, message: string, patches: FilePatch[] }`
  - Output: `{ commit: string }`

- git_pull_push
  - Input: `{ projectId: string, policy?: { mode: "ff-only"|"rebase" } }`
  - Output: `{ pushed: boolean, summary?: any }`

Policy checks:
- Pre-commit policy enforcement scans workspace for large files and LFS pointers; violations are returned as structured errors.
- Compile endpoints enforce allowedExtensions and allowedCompilers per project policy.

- git_clone_overleaf
  - Input: `{ projectId: string, remoteUrl: string, auth: { username?: string, token?: string } }`
  - Output: `{ path: string }`

- sync_with_local (guarded)
  - Input: `{ projectId: string, direction: "pull"|"push"|"both" }`
  - Output: `{ pulled?: string, pushed?: string }`

- git_compile_on_push
  - Input: `{ projectId: string, compileOptions?: any }`
  - Output: `{ pushed: boolean, compile?: { status: string, artifacts?: { pdfUrl?: string } } }`

## Watch and Logs

- watch.start | watch.stop | watch.list | watch.tail
  - Manage filesystem monitors and log tails.

- forward_search.hint
  - Input: `{ projectId: string, filePath: string, line: number }`
  - Output: `{ page: number, x: number, y: number }`

## Optional/HTTP endpoints

- GET /artifacts/:id (signed URL handler)
- GET /metrics (Prometheus)
- GET /health
- POST /cancel (cancel a running/queued operation)

## Types

- Diagnostic, Diff, OutlineNode, SectionNode, Node, FilePatch, Patch
- All types are versioned and validated via zod/JSON Schema; mismatches return `invalid_request` errors.
