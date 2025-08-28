import { spawn } from 'node:child_process';
import path from 'node:path';

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

  async isRepo(): Promise<boolean> {
    const res = await runGit(['rev-parse', '--is-inside-work-tree'], this.cwd);
    return res.code === 0 && res.stdout.trim() === 'true';
  }

  async init(): Promise<void> {
    await runGit(['init'], this.cwd);
  }

  static async clone(url: string, targetDir: string): Promise<void> {
    await runGit(['clone', url, targetDir]);
  }

  async setRemote(name: string, url: string): Promise<void> {
    // Try set-url first, then add if missing
    const set = await runGit(['remote', 'set-url', name, url], this.cwd);
    if (set.code !== 0) {
      await runGit(['remote', 'add', name, url], this.cwd);
    }
  }

  async fetch(remote = 'origin'): Promise<void> {
    await runGit(['fetch', remote, '--prune'], this.cwd);
  }

  async checkoutBranch(name: string): Promise<void> {
    await runGit(['checkout', '-B', name], this.cwd);
  }

  async currentBranch(): Promise<string> {
    const res = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], this.cwd);
    return res.stdout.trim();
  }

  async addAll(): Promise<void> {
    await runGit(['add', '-A'], this.cwd);
  }

  async commit(message: string): Promise<void> {
    await runGit(['commit', '-m', message], this.cwd);
  }

  async headSha(): Promise<string> {
    const res = await runGit(['rev-parse', 'HEAD'], this.cwd);
    return res.stdout.trim();
  }

  async pullFFOnly(remote = 'origin', branch?: string): Promise<void> {
    const target = branch || (await this.currentBranch());
    await runGit(['pull', '--ff-only', remote, target], this.cwd);
  }

  async pullRebase(remote = 'origin', branch?: string): Promise<void> {
    const target = branch || (await this.currentBranch());
    await runGit(['pull', '--rebase', remote, target], this.cwd);
  }

  async push(remote = 'origin', branch?: string): Promise<void> {
    const target = branch || (await this.currentBranch());
    await runGit(['push', '-u', remote, target], this.cwd);
  }
}
