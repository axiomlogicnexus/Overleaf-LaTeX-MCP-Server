import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import { CompileProvider, CompileOptions, CompileResult, Diagnostic } from './CompileProvider';

function run(cmd: string, args: string[], cwd: string, timeoutMs: number): Promise<{ code: number; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, shell: false });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill('SIGKILL'); } catch {}
      resolve({ code: -1, stdout, stderr: stderr + `\n<timeout after ${timeoutMs}ms>`, timedOut: true });
    }, timeoutMs);

    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: String(err), timedOut: false });
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr, timedOut: false });
    });
  });
}

async function detectBinary(cwd: string): Promise<'latexmk' | 'xelatex' | 'pdflatex' | null> {
  const tryCmd = async (cmd: string) => {
    const res = await run(cmd, ['-version'], cwd, 5000);
    return res.code === 0;
  };
  if (await tryCmd('latexmk')) return 'latexmk';
  if (await tryCmd('xelatex')) return 'xelatex';
  if (await tryCmd('pdflatex')) return 'pdflatex';
  return null;
}

function parseDiagnostics(log: string): Diagnostic[] {
  const diags: Diagnostic[] = [];
  const lines = log.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('!')) {
      // LaTeX error line, try to capture following context
      const message = line.replace(/^!\s*/, '').trim();
      // Try to find a file/line hint in the next few lines
      let file: string | undefined;
      let ln: number | undefined;
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        const m = lines[j].match(/l\.(\d+)/);
        if (m) {
          ln = Number(m[1]);
          break;
        }
      }
      diags.push({ severity: 'error', file, line: ln, message });
    } else if (/^LaTeX Warning:/.test(line)) {
      diags.push({ severity: 'warning', message: line.replace(/^LaTeX Warning:\s*/, '') });
    }
  }
  if (diags.length === 0) {
    diags.push({ severity: 'info', message: 'Compilation finished, no structured diagnostics parsed' });
  }
  return diags;
}

export class LocalProvider implements CompileProvider {
  async compile(projectPath: string, rootResourcePath: string, options: CompileOptions): Promise<CompileResult> {
    const timeoutMs = Math.max(1000, options.timeoutMs ?? 120000);
    const compilerPref = options.compiler ?? 'latexmk';

    const mainRel = rootResourcePath.endsWith('.tex') ? rootResourcePath : `${rootResourcePath}.tex`;
    const mainAbs = path.resolve(projectPath, mainRel);
    const mainBase = path.basename(mainAbs, path.extname(mainAbs));

    try {
      await fs.access(mainAbs);
    } catch {
      return { diagnostics: [{ severity: 'error', message: `rootResourcePath not found: ${mainRel}` }] };
    }

    const bin = await detectBinary(projectPath);
    if (!bin) {
      return { diagnostics: [{ severity: 'error', message: 'No LaTeX toolchain found (latexmk/xelatex/pdflatex not available in PATH)' }] };
    }

    const shellEscape = options.shellEscape ?? 'off';
    const extraArgs: string[] = [];

    // We do not enable shell-escape here regardless of options (policy: off by default)
    // Some engines accept -no-shell-escape; safest is to omit any enabling flags.

    let args: string[] = [];
    if (bin === 'latexmk') {
      // latexmk -pdf -interaction=nonstopmode -file-line-error -synctex=1 main.tex
      args = ['-pdf', '-interaction=nonstopmode', '-file-line-error', '-synctex=1', mainRel, ...extraArgs];
    } else {
      // xelatex/pdflatex path
      args = ['-interaction=nonstopmode', '-file-line-error', '-synctex=1', mainRel, ...extraArgs];
    }

    const { code, stdout, stderr, timedOut } = await run(bin, args, projectPath, timeoutMs);
    const combined = [stdout, stderr].filter(Boolean).join('\n');

    const logsDir = path.resolve(projectPath, '.mcp-logs');
    await fs.mkdir(logsDir, { recursive: true });
    const logPath = path.join(logsDir, `${mainBase}.log.txt`);
    await fs.writeFile(logPath, combined);

    const pdfPath = path.resolve(projectPath, `${mainBase}.pdf`);

    const diags = parseDiagnostics(combined);
    if (timedOut) {
      diags.unshift({ severity: 'error', code: 'timeout', message: `Compilation timed out after ${timeoutMs}ms` });
    }
    if (code !== 0 && !timedOut) {
      diags.unshift({ severity: 'warning', code: 'nonzero_exit', message: `Compiler '${bin}' exited with code ${code}` });
    }
    if (shellEscape !== 'off') {
      diags.unshift({ severity: 'warning', code: 'policy', message: 'shell-escape is disabled by policy; ignoring requested setting' });
    }

    return {
      diagnostics: diags,
      artifacts: {
        pdfPath: pdfPath,
        logPath: logPath,
        // synctex may be generated depending on engine
        synctexPath: path.resolve(projectPath, `${mainBase}.synctex.gz`),
      },
    };
  }
}
