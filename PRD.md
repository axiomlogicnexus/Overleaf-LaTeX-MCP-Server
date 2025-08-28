# Project Requirements Document (PRD)

## Overview
Build a secure, robust, and intelligent Overleaf LaTeX MCP Server in TypeScript that brokers between LLM clients and Overleaf compile/Git surfaces. The server exposes an MCP tool surface for compile, edit, Git workflows, LaTeX analysis, and diagnostics, with strong security, observability, and policy enforcement.

## Goals
- Provide a unified compile interface with Local and CLSI providers.
- Enable safe, hash-validated editing and Git session workflows for LLM-driven changes.
- Deliver structured diagnostics and artifact URLs (not inline blobs).
- Enforce strict security policies: path containment, no shell invocation, resource limits, and secret masking.
- Offer strong observability (logs, metrics, traces) and capability discovery.
- Support optional Python sidecar for lint/format/PDF utilities.

## Non-Goals
- Provide a full web UI; scope is MCP tool surface (optional minimal HTTP endpoints only).
- Runtime TeX package installation on host (tex.pkg_install is gated and container-only if ever enabled).
- Desktop editor integration (e.g., TeXstudio) in production surfaces.

## Users and Use Cases
- LLM clients: drive compile/edit flows, receive structured diagnostics.
- Researchers/teams: safe Git workflows with session branches; preflight and linting.
- Operators: monitor health/metrics; configure policies; manage artifacts and capacity.

## Functional Requirements
- MCP tools for compile (sync/async), artifact retrieval, diagnostics.
- Text editing with hash-validated patches; AST-aware LaTeX manipulations.
- Git session workflow: clone, session branch, commit, pull/push, with policy checks.
- Capability and policy endpoints; health and metrics.
- Artifact store with TTL and signed URLs.

## Security Requirements
- Enforce path containment and reject traversal/symlink escapes.
- Never use `shell: true`; spawn with args arrays only.
- Disable shell-escape by default; sandbox local compiles with time/memory caps.
- Mask secrets; apply rate limiting and size quotas.

## Performance and Scale
- Queue with per-project debounce and global concurrency limit.
- Stream logs and coalesce compile requests to reduce redundant work.
- Caching (later phases): reuse LaTeX aux/TEXMF cache per project hash.

## Observability
- Structured logs (pino), Prometheus metrics, and OpenTelemetry traces.
- health.check and get_metrics endpoints.

## Deliverables and Milestones
- Phase 0.1–1.0 as defined in ROADMAP.md, including: core scaffolding; compile providers; queue and artifacts; Git session flow; LaTeX intelligence; security hardening; observability; multi-tenant and object storage integration.

## Constraints
- Primary OS: Windows; must also run on macOS/Linux.
- Use system git and LaTeX toolchain where available; prefer containers for local compilation on Windows.

## Acceptance Criteria
- Tools return standardized shapes; policies enforced; artifacts delivered via URLs.
- Git flows are non-destructive by default; conflicts handled; no force pushes.
- Metrics and logs are present from early phases; health reflects real dependency status.
