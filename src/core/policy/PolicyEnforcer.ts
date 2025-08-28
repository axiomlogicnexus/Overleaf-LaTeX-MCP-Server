import fs from 'node:fs/promises';
import path from 'node:path';
import { Policy } from '../config/Config';

export type Violation = { code: string; path?: string; message: string; sizeBytes?: number };

export async function scanWorkspaceForPolicy(root: string, policy: Policy): Promise<Violation[]> {
  const violations: Violation[] = [];
  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        // skip .git directory
        if (e.name === '.git') continue;
        await walk(p);
      } else {
        const rel = path.relative(root, p);
        try {
          const st = await fs.stat(p);
          if (st.size > policy.maxFileSizeBytes) {
            violations.push({ code: 'file_too_large', path: rel, message: `File exceeds max size: ${rel}`, sizeBytes: st.size });
          }
        } catch {}
      }
    }
  }
  await walk(root);
  return violations;
}
