import path from 'node:path';
import fs from 'node:fs/promises';

export class WorkspaceManager {
  constructor(private readonly root: string) {}

  resolveWithin(workspaceId: string, p: string): string {
    const base = path.resolve(this.root, workspaceId);
    const full = path.resolve(base, p);
    if (!full.startsWith(base + path.sep) && full !== base) {
      throw new Error('Path containment violation');
    }
    return full;
  }

  async ensureWorkspace(workspaceId: string): Promise<string> {
    const base = path.resolve(this.root, workspaceId);
    await fs.mkdir(base, { recursive: true });
    return base;
  }
}
