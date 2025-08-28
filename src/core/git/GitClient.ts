import { spawn } from 'node:child_process';

function runGit(args: string[], cwd?: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('git', args, { cwd, shell: false });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

export class GitClient {
  constructor(private readonly cwd: string) {}

  async init(): Promise<void> {
    await runGit(['init'], this.cwd);
  }

  async clone(url: string, dir: string): Promise<void> {
    await runGit(['clone', url, dir]);
  }

  async checkoutBranch(name: string): Promise<void> {
    await runGit(['checkout', '-B', name], this.cwd);
  }
}
