import fs from 'node:fs/promises';
import path from 'node:path';
import { Policy } from '../config/Config';

export type Violation = { code: string; path?: string; message: string; sizeBytes?: number };

async function isLikelyLfsPointer(p: string): Promise<boolean> {
  try {
    const buf = await fs.readFile(p);
    // LFS pointers are small text files; detect signature
    if (buf.length > 1024) return false;
    const s = buf.toString('utf-8');
    return s.startsWith('version https://git-lfs.github.com/spec/v1');
  } catch {
    return false;
  }
}

async function isLikelyBinary(p: string): Promise<boolean> {
  try {
    const buf = await fs.readFile(p);
    const sample = buf.subarray(0, Math.min(buf.length, 4096));
    // Heuristic: presence of NUL or >30% non-printable bytes suggests binary
    let nonPrintable = 0;
    for (let i = 0; i < sample.length; i++) {
      const b = sample[i];
      if (b === 0) return true;
      // printable ASCII range + common whitespace (tab/newline/carriage return)
      if (!(b === 9 || b === 10 || b === 13 || (b >= 32 && b <= 126))) {
        nonPrintable++;
      }
    }
    return nonPrintable / sample.length > 0.3;
  } catch {
    return false;
  }
}

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
          if (await isLikelyLfsPointer(p)) {
            violations.push({ code: 'lfs_pointer', path: rel, message: `File appears to be a Git LFS pointer: ${rel}` });
          }
          if (await isLikelyBinary(p)) {
            violations.push({ code: 'binary_detected', path: rel, message: `Binary file detected: ${rel}` });
          }
        } catch {}
      }
    }
  }
  await walk(root);
  return violations;
}
