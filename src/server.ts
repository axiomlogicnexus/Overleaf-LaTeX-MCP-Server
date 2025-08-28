import pino from 'pino';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { ArtifactStore } from './core/artifacts/ArtifactStore';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

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

async function main() {
  logger.info({ msg: 'Overleaf LaTeX MCP Server starting' });

  const root = process.cwd();
  const workspacesDir = path.resolve(root, 'workspaces');
  const artifactsDir = path.resolve(root, 'artifacts');

  await fs.mkdir(workspacesDir, { recursive: true });
  await fs.mkdir(artifactsDir, { recursive: true });

  const caps = await getCapabilities();
  logger.info({ msg: 'Capabilities detected', caps });

  const health = await healthCheck(workspacesDir, artifactsDir);
  logger.info({ msg: 'Health check', health });

  // Minimal HTTP handler for artifacts and health/capabilities (optional)
  const artifactStore = new ArtifactStore(artifactsDir, 60 * 60 * 1000);
  const server = http.createServer(async (req, res) => {
    try {
      if (!req.url) { res.statusCode = 404; res.end(); return; }
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
