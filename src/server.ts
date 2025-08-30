import pino from 'pino';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { startMcpWsServer } from './mcp/WsServer';
import { ArtifactStore } from './core/artifacts/ArtifactStore';
import { registerMcpTools } from './mcp/ToolRegistry';
import { WorkspaceManager } from './core/workspace/WorkspaceManager';
import { OperationManager } from './core/operations/OperationManager';
import { CompileService } from './core/compile/CompileService';
import { getTextFileContents, patchTextFileContents } from './core/text/TextTools';
import { loadConfig, resolvePolicy, isAllowedExtension } from './core/config/Config';
import { GitClient } from './core/git/GitClient';
import { Metrics } from './core/metrics/Metrics';
import { scanWorkspaceForPolicy } from './core/policy/PolicyEnforcer';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

function cryptoRandom() {
  // Not cryptographically strong; acceptable for branch suffixes
  return Math.random().toString(36).slice(2, 10);
}

async function run(cmd: string, args: string[], cwd?: string, timeoutMs = 5000): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, shell: false });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch {}
    }, timeoutMs);
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: String(err) });
    });
  });
}

async function detect(cmd: string): Promise<boolean> {
  const res = await run(cmd, ['-version']);
  return res.code === 0;
}

async function getCapabilities() {
  const providers: string[] = [];
  if (await detect('latexmk') || await detect('xelatex') || await detect('pdflatex')) providers.push('local');
  // CLSI capability is deployment-dependent; report false by default
  const tools = {
    tex_lint: await detect('chktex'),
    tex_format: await detect('latexindent'),
    pdf_tools: false,
  };
  const limits = {
    compileTimeoutMs: Number(process.env.DEFAULT_COMPILE_TIMEOUT_MS || 120000),
    maxFileSizeBytes: 10 * 1024 * 1024,
    maxProjectSizeBytes: 200 * 1024 * 1024,
  };
  return { providers, tools, limits };
}

async function healthCheck(workspacesDir: string, artifactsDir: string) {
  const checks: Record<string, boolean> = {
    git: (await run('git', ['--version'])).code === 0,
    workspace: false,
    artifactStore: false,
  };
  try { await fs.mkdir(workspacesDir, { recursive: true }); checks.workspace = true; } catch { checks.workspace = false; }
  try { await fs.mkdir(artifactsDir, { recursive: true }); checks.artifactStore = true; } catch { checks.artifactStore = false; }
  return checks;
}

async function warnIfMisconfiguredRemote(root: string) {
  try {
    const rem = await run('git', ['remote', '-v'], root);
    const lines = rem.stdout.split(/\r?\n/).filter(Boolean);
    const origin = lines.find(l => l.startsWith('origin')) || '';
    if (!origin.includes('github.com/axiomlogicnexus/Overleaf-LaTeX-MCP-Server')) {
      // eslint-disable-next-line no-console
      console.warn('[WARN] Top-level repo origin does not point to GitHub. Current:', origin);
    }
    const cfg = await run('git', ['config', '--global', '-l'], root);
    if (/url\..*insteadof=.*localhost|overleaf/i.test(cfg.stdout)) {
      // eslint-disable-next-line no-console
      console.warn('[WARN] Detected url.*.insteadof that may rewrite GitHub to localhost/Overleaf.');
    }
  } catch {
    // ignore
  }
}

async function main() {
  logger.info({ msg: 'Overleaf LaTeX MCP Server starting' });

  const root = process.cwd();
  const workspacesDir = path.resolve(root, 'workspaces');
  const artifactsDir = path.resolve(root, 'artifacts');

  await fs.mkdir(workspacesDir, { recursive: true });
  await fs.mkdir(artifactsDir, { recursive: true });

  const caps = await getCapabilities();
  logger.info({ msg: 'Capabilities detected', caps });

  await warnIfMisconfiguredRemote(root);

  const health = await healthCheck(workspacesDir, artifactsDir);
  logger.info({ msg: 'Health check', health });

  // Instantiate services
  const workspaces = new WorkspaceManager(workspacesDir);
  const artifactStore = new ArtifactStore(artifactsDir, 60 * 60 * 1000);
  const ops = new OperationManager<any, any>();
  const compileService = new CompileService(workspaces, artifactStore);
  const metrics = new Metrics();
  const appConfig = await loadConfig(root);

  // Initialize MCP tool registry (placeholder)
  const mcpTools = await registerMcpTools({
    compileService,
    ops,
    workspaces,
    artifacts: artifactStore,
    getCapabilities,
    healthCheck: () => healthCheck(workspacesDir, artifactsDir),
    appConfigRoot: root,
  });
  logger.info({ msg: 'MCP tools registered', tools: mcpTools.map(t => t.name) });

  // Minimal HTTP handler for artifacts and health/capabilities (optional)
  const server = http.createServer(async (req, res) => {
    try {
      if (!req.url) { res.statusCode = 404; res.end(); return; }

      // helper to read JSON body
      const readJson = async <T = any>(): Promise<T> => {
        const chunks: Buffer[] = [];
        await new Promise<void>((resolve, reject) => {
          req.on('data', (d) => chunks.push(Buffer.from(d)));
          req.on('end', () => resolve());
          req.on('error', reject);
        });
        const raw = Buffer.concat(chunks).toString('utf-8') || '{}';
        try { return JSON.parse(raw) as T; } catch { throw new Error('invalid_json'); }
      };

      if (req.method === 'GET' && req.url.startsWith('/artifacts/')) {
        const id = req.url.split('/').pop() as string;
        const ref = artifactStore.get(id);
        if (!ref) { res.statusCode = 404; res.end('Not Found'); return; }
        const data = await fs.readFile(ref.path);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/octet-stream');
        res.end(data);
        return;
      }
      if (req.method === 'POST' && req.url === '/git/startSession') {
        try {
          const body = await readJson<{ projectId: string; remoteUrl: string; branch?: string }>();
          const ws = await workspaces.ensureWorkspace(body.projectId);
          // If workspace not a repo: clone, else set remote and fetch
          const git = new GitClient(ws);
          if (!(await git.isRepo())) {
            await GitClient.clone(body.remoteUrl, ws);
          } else {
            await git.setRemote('origin', body.remoteUrl);
            await git.fetch('origin');
          }
          const sessionBranch = body.branch || `mcp-session/${cryptoRandom()}`;
          await git.checkoutBranch(sessionBranch);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ status: 'ok', data: { branch: sessionBranch } }));
        } catch (e: any) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ status: 'error', errors: [{ code: 'git_start_failed', message: String(e?.message || e) }] }));
        }
        return;
      }

      if (req.method === 'POST' && req.url === '/git/commitPatch') {
        try {
          const body = await readJson<{ projectId: string; message: string }>();
          const ws = await workspaces.ensureWorkspace(body.projectId);
          const git = new GitClient(ws);
          // Policy: scan for large files before committing
          {
            const policy = resolvePolicy(body.projectId, appConfig);
            const violations = await scanWorkspaceForPolicy(ws, policy);
            if (violations.length) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ status: 'error', errors: violations.map(v => ({ code: v.code, message: v.message, details: { path: v.path, sizeBytes: v.sizeBytes } })) }));
              return;
            }
          }
          await git.addAll();
          await git.commit(body.message);
          const sha = await git.headSha();
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ status: 'ok', data: { commit: sha } }));
        } catch (e: any) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ status: 'error', errors: [{ code: 'git_commit_failed', message: String(e?.message || e) }] }));
        }
        return;
      }

      if (req.method === 'POST' && req.url === '/git/pullPush') {
        try {
          const body = await readJson<{ projectId: string; mode?: 'ff-only' | 'rebase' }>();
          const ws = await workspaces.ensureWorkspace(body.projectId);

          // Policy checks before any network operation
          const policy = resolvePolicy(body.projectId, appConfig);
          // 1) Require main.tex presence
          try {
            await fs.access(path.join(ws, 'main.tex'));
          } catch {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ status: 'error', errors: [{ code: 'missing_main_tex', message: 'main.tex not found in project root' }] }));
            return;
          }
          // 2) Disallowed extensions scan
          {
            const { listFiles } = await import('./core/project/ProjectTools');
            const files = await listFiles(ws);
            const bad: string[] = [];
            for (const f of files) {
              if (!isAllowedExtension(f, policy)) bad.push(f);
            }
            if (bad.length) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ status: 'error', errors: [{ code: 'disallowed_extensions', message: 'Project contains files with disallowed extensions', details: { files: bad } }] }));
              return;
            }
          }

          // 3) Workspace policy scan for size/LFS/binary
          {
            const v = await scanWorkspaceForPolicy(ws, policy);
            if (v.length) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ status: 'error', errors: v.map(x => ({ code: x.code, message: x.message, details: { path: x.path, sizeBytes: x.sizeBytes } })) }));
              return;
            }
          }

          const git = new GitClient(ws);
          if (body.mode === 'rebase') await git.pullRebase('origin'); else await git.pullFFOnly('origin');
          await git.push('origin');
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ status: 'ok', data: { pushed: true } }));
        } catch (e: any) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ status: 'error', errors: [{ code: 'git_pull_push_failed', message: String(e?.message || e) }] }));
        }
        return;
      }

      if (req.method === 'GET' && req.url === '/metrics') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain; version=0.0.4');
        res.end(metrics.renderProm());
        return;
      }

      if (req.method === 'POST' && req.url === '/compile') {
        try {
          const body = await readJson<{ projectId: string; rootResourcePath: string; options?: any }>();
          const start = Date.now();
          await workspaces.ensureWorkspace(body.projectId);
          // Enforce policy: file extension check
          const policy = resolvePolicy(body.projectId, appConfig);
          if (!isAllowedExtension(body.rootResourcePath, policy)) throw new Error('disallowed_extension');
          if (body.options?.compiler && !policy.allowedCompilers.includes(body.options.compiler)) throw new Error('disallowed_compiler');
          const out = await compileService.compileSync(body.projectId, body.rootResourcePath, body.options || {});
          metrics.inc('compile_requests_total');
          metrics.observe('compile_duration_ms', Date.now() - start);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ status: 'ok', data: { diagnostics: out.result.diagnostics, artifacts: out.artifacts } }));
        } catch (e: any) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ status: 'error', errors: [{ code: 'compile_failed', message: String(e?.message || e) }] }));
        }
        return;
      }

      if (req.method === 'POST' && req.url === '/compileAsync') {
        try {
          const body = await readJson<{ projectId: string; rootResourcePath: string; options?: any }>();
          await workspaces.ensureWorkspace(body.projectId);
          const policy = resolvePolicy(body.projectId, appConfig);
          if (!isAllowedExtension(body.rootResourcePath, policy)) throw new Error('disallowed_extension');
          if (body.options?.compiler && !policy.allowedCompilers.includes(body.options.compiler)) throw new Error('disallowed_compiler');
          const operationId = compileService.compileAsync(body.projectId, body.rootResourcePath, body.options || {}, ops);
          metrics.inc('compile_async_requests_total');
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ status: 'ok', data: { operationId } }));
        } catch (e: any) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ status: 'error', errors: [{ code: 'compile_failed', message: String(e?.message || e) }] }));
        }
        return;
      }

      if (req.method === 'GET' && req.url.startsWith('/compileStatus')) {
        const u = new URL(req.url, 'http://localhost');
        const id = u.searchParams.get('operationId') || '';
        const op = ops.get(id);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        if (!op) { res.end(JSON.stringify({ status: 'error', errors: [{ code: 'not_found', message: 'operation not found' }] })); return; }
        res.end(JSON.stringify({ status: 'ok', data: op }));
        return;
      }

      if (req.method === 'POST' && req.url === '/cancel') {
        try {
          const body = await readJson<{ operationId: string }>();
          const op = ops.get(body.operationId);
          if (!op) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ status: 'error', errors: [{ code: 'not_found', message: 'operation not found' }] }));
            return;
          }
          const cancelled = ops.cancel(body.operationId);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ status: 'ok', data: { cancelled } }));
        } catch (e: any) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ status: 'error', errors: [{ code: 'cancel_failed', message: String(e?.message || e) }] }));
        }
        return;
      }

      if (req.method === 'GET' && req.url === '/mcp/tools') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ status: 'ok', data: mcpTools.map(t => ({ name: t.name, description: t.description })) }));
        return;
      }

      if (req.method === 'POST' && req.url === '/mcp/invoke') {
        try {
          const body = await readJson<{ tool: string; input?: any }>();
          const tool = mcpTools.find(t => t.name === body.tool);
          if (!tool) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ status: 'error', errors: [{ code: 'tool_not_found', message: `No such tool: ${body.tool}` }] }));
            return;
          }
          // Validate input if schema provided (assume zod)
          let parsed = body.input ?? {};
          try {
            if (tool.inputSchema && typeof tool.inputSchema.parse === 'function') {
              parsed = tool.inputSchema.parse(body.input ?? {});
            }
          } catch (e: any) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ status: 'error', errors: [{ code: 'invalid_request', message: String(e?.message || e) }] }));
            return;
          }
          const result = await tool.handler(parsed);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ status: 'ok', data: result }));
        } catch (e: any) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ status: 'error', errors: [{ code: 'invoke_failed', message: String(e?.message || e) }] }));
        }
        return;
      }

      if (req.method === 'GET' && req.url.startsWith('/files')) {
        const u = new URL(req.url, 'http://localhost');
        const projectId = u.searchParams.get('projectId') || '';
        const ext = u.searchParams.get('ext') || undefined;
        try {
          const ws = await workspaces.ensureWorkspace(projectId);
          // optional ext filter
          const { listFiles } = await import('./core/project/ProjectTools');
          const files = await listFiles(ws, ext);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ status: 'ok', data: { files } }));
        } catch (e: any) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ status: 'error', errors: [{ code: 'files_failed', message: String(e?.message || e) }] }));
        }
        return;
      }

      if (req.method === 'GET' && req.url === '/projects') {
        try {
          const projects = Object.entries(appConfig.projects).map(([key, p]) => ({ key, name: p.name, projectId: p.projectId }));
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ status: 'ok', data: { projects } }));
        } catch (e: any) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ status: 'error', errors: [{ code: 'projects_failed', message: String(e?.message || e) }] }));
        }
        return;
      }

      if (req.method === 'GET' && req.url.startsWith('/statusSummary')) {
        const u = new URL(req.url, 'http://localhost');
        const projectId = u.searchParams.get('projectId') || '';
        try {
          const ws = await workspaces.ensureWorkspace(projectId);
          const { listFiles } = await import('./core/project/ProjectTools');
          const files = await listFiles(ws);
          const hasMainTex = files.includes('main.tex');
          const counts = { tex: 0, bib: 0, images: 0, pdf: 0, other: 0 } as Record<string, number>;
          const imgExts = new Set(['.png', '.jpg', '.jpeg', '.svg', '.eps']);
          for (const f of files) {
            const ext = path.extname(f).toLowerCase();
            if (ext === '.tex') counts.tex++;
            else if (ext === '.bib') counts.bib++;
            else if (imgExts.has(ext)) counts.images++;
            else if (ext === '.pdf') counts.pdf++;
            else counts.other++;
          }
          const git = new GitClient(ws);
          const isRepo = await git.isRepo();
          let branch: string | undefined;
          let head: string | undefined;
          if (isRepo) {
            try { branch = await git.currentBranch(); } catch {}
            try { head = await git.headSha(); } catch {}
          }
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ status: 'ok', data: { projectId, hasMainTex, fileCount: files.length, counts, git: { isRepo, branch, head } } }));
        } catch (e: any) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ status: 'error', errors: [{ code: 'status_summary_failed', message: String(e?.message || e) }] }));
        }
        return;
      }

      if (req.method === 'POST' && req.url === '/text/get') {
        try {
          const body = await readJson<{ projectId: string; filePath: string; ranges?: { start: number; end: number }[] }>();
          const ws = await workspaces.ensureWorkspace(body.projectId);
          const policy = resolvePolicy(body.projectId, appConfig);
          if (!isAllowedExtension(body.filePath, policy)) throw new Error('disallowed_extension');
          const out = await getTextFileContents(ws, body.filePath, body.ranges);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ status: 'ok', data: out }));
        } catch (e: any) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ status: 'error', errors: [{ code: 'text_get_failed', message: String(e?.message || e) }] }));
        }
        return;
      }

      if (req.method === 'POST' && req.url === '/text/patch') {
        try {
          const body = await readJson<{ projectId: string; filePath: string; baseHash: string; patches: { startLine: number; endLine: number; expectedHash: string; newText: string }[] }>();
          const ws = await workspaces.ensureWorkspace(body.projectId);
          const policy = resolvePolicy(body.projectId, appConfig);
          if (!isAllowedExtension(body.filePath, policy)) throw new Error('disallowed_extension');
          const out = await patchTextFileContents(ws, body.filePath, body.baseHash, body.patches);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ status: 'ok', data: out }));
        } catch (e: any) {
          res.statusCode = 409;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ status: 'error', errors: [{ code: 'text_patch_failed', message: String(e?.message || e) }] }));
        }
        return;
      }

      if (req.method === 'GET' && req.url === '/health') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ status: 'ok', checks: await healthCheck(workspacesDir, artifactsDir) }));
        return;
      }
      if (req.method === 'GET' && req.url === '/capabilities') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ status: 'ok', data: await getCapabilities() }));
        return;
      }
      res.statusCode = 404;
      res.end('Not Found');
    } catch (e: any) {
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  });
  const port = Number(process.env.PORT || 8080);
  server.listen(port, () => logger.info({ msg: 'HTTP server listening', port }));
  // Start WS MCP bridge
  startMcpWsServer(server, mcpTools, '/mcp/ws');

  // TODO: Register MCP tools, wire providers, queue, artifact store
  process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down');
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down');
    process.exit(0);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
