import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export type ArtifactRef = { id: string; path: string; expiresAt: number };

export class ArtifactStore {
  private index = new Map<string, ArtifactRef>();

  constructor(private readonly root: string, private readonly ttlMs: number = 60 * 60 * 1000) {}

  async writeTemp(buffer: Buffer, ext: string): Promise<ArtifactRef> {
    const id = crypto.randomUUID();
    const dir = path.resolve(this.root);
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `${id}.${ext.replace(/^\./, '')}`);
    await fs.writeFile(filePath, buffer);
    const ref = { id, path: filePath, expiresAt: Date.now() + this.ttlMs };
    this.index.set(id, ref);
    return ref;
  }

  putExisting(filePath: string, ttlMs?: number): ArtifactRef {
    const id = crypto.randomUUID();
    const ref = { id, path: path.resolve(filePath), expiresAt: Date.now() + (ttlMs ?? this.ttlMs) };
    this.index.set(id, ref);
    return ref;
  }

  get(id: string): ArtifactRef | undefined {
    const ref = this.index.get(id);
    if (!ref) return undefined;
    if (Date.now() > ref.expiresAt) {
      this.index.delete(id);
      return undefined;
    }
    return ref;
  }

  async gc(): Promise<void> {
    const now = Date.now();
    for (const [id, ref] of this.index) {
      if (now > ref.expiresAt) this.index.delete(id);
    }
  }

  signUrl(ref: ArtifactRef): { url: string; expiresAt: string } {
    // Served by built-in HTTP handler at GET /artifacts/:id
    return { url: `/artifacts/${ref.id}`, expiresAt: new Date(ref.expiresAt).toISOString() };
  }
}
