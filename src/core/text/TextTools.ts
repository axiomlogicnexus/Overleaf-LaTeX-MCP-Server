import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';

export type TextRange = { start: number; end: number };
export type Patch = { startLine: number; endLine: number; expectedHash: string; newText: string };

export function sha256(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

export async function getTextFileContents(projectRoot: string, filePath: string, ranges?: TextRange[]): Promise<{ content: string; hash: string }>
{
  const abs = path.resolve(projectRoot, filePath);
  if (!abs.startsWith(path.resolve(projectRoot) + path.sep) && abs !== path.resolve(projectRoot)) {
    throw new Error('Path containment violation');
  }
  const content = await fs.readFile(abs, 'utf-8');
  if (!ranges || ranges.length === 0) return { content, hash: sha256(content) };
  const lines = content.split(/\r?\n/);
  const parts = ranges.map(r => lines.slice(r.start - 1, r.end).join('\n'));
  return { content: parts.join('\n'), hash: sha256(content) };
}

export async function patchTextFileContents(projectRoot: string, filePath: string, baseHash: string, patches: Patch[]): Promise<{ newHash: string }>
{
  const abs = path.resolve(projectRoot, filePath);
  if (!abs.startsWith(path.resolve(projectRoot) + path.sep) && abs !== path.resolve(projectRoot)) {
    throw new Error('Path containment violation');
  }
  let content = await fs.readFile(abs, 'utf-8');
  if (sha256(content) !== baseHash) {
    throw new Error('Conflict: base hash mismatch');
  }
  let lines = content.split(/\r?\n/);
  // Apply patches in order; simple line-based replacement
  for (const p of patches) {
    const expectedSegment = lines.slice(p.startLine - 1, p.endLine).join('\n');
    if (sha256(expectedSegment) !== p.expectedHash) {
      throw new Error('Conflict: hunk hash mismatch');
    }
    const newLines = p.newText.split(/\r?\n/);
    lines.splice(p.startLine - 1, (p.endLine - p.startLine + 1), ...newLines);
  }
  content = lines.join('\n');
  await fs.writeFile(abs, content, 'utf-8');
  return { newHash: sha256(content) };
}
