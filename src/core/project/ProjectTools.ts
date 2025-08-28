import path from 'node:path';
import fs from 'node:fs/promises';

export async function listFiles(root: string, extFilter?: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else {
        if (!extFilter || path.extname(e.name).toLowerCase() === extFilter.toLowerCase()) {
          out.push(path.relative(root, p));
        }
      }
    }
  }
  await walk(root);
  return out;
}
