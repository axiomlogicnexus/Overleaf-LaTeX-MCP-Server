# Global Rules

These rules apply across the project and must be followed strictly.

## Command Preferences
- Use PowerShell for file operations (more reliable than cmd.exe)
- PowerShell file search: `Get-ChildItem -Path [path] -Recurse -Filter [pattern]`
- Process killing: `taskkill /F /IM [process.exe]`
- Use semicolons (;) instead of ampersands (&&) for command chaining in PowerShell
- SAFETY: Never use deletion commands outside project workspace, unless specifically instructed to. Verify paths and running processes first.

## Language and Tooling


## Security and Safety
- Shell escape disabled by default for LaTeX runs; enable only when explicitly requested. Emit warnings when enabled.
- Normalize and validate paths. If a workspace root is provided, reject paths that resolve outside it. Use path.resolve and containment checks.
- Never pass user strings to a shell. Use spawn with args arrays; avoid shell: true.
- Enforce timeouts and allow cancellation; kill entire child process trees.

## OS and Compatibility
- Primary platform: Windows; also support macOS and Linux.
- Discovery order for binaries: explicit config > PATH lookup > OS fallbacks (Windows registry for MiKTeX/TeX Live; standard app paths on macOS; which on Linux).


## Logging and Diagnostics


## Code Quality


## Git and Commits
- Conventional Commits (feat, fix, docs, chore, refactor, test, build, ci).
- Keep CHANGELOG.md updated per milestone.

## Documentation
- Keep API.md aligned with implemented MCP tools and schemas.
- Update DEVELOPMENT.md when scripts or workflows change.
