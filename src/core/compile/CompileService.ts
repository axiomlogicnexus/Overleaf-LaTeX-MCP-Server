import path from 'node:path';
import { LocalProvider } from '../providers/LocalProvider';
import { CompileOptions, CompileResult } from '../providers/CompileProvider';
import { WorkspaceManager } from '../workspace/WorkspaceManager';
import { ArtifactStore } from '../artifacts/ArtifactStore';
import { OperationManager } from '../operations/OperationManager';
import fs from 'node:fs/promises';

export class CompileService {
  // Dedup map: key = `${workspaceId}::${rootResourcePath}`
  private pending = new Map<string, string>();

  constructor(
    private readonly workspaces: WorkspaceManager,
    private readonly artifacts: ArtifactStore,
  ) {}

  async compileSync(workspaceId: string, rootResourcePath: string, options: CompileOptions): Promise<{ result: CompileResult; artifacts?: { pdfUrl?: string; logUrl?: string; synctexUrl?: string } }>{
    const wsPath = await this.workspaces.ensureWorkspace(workspaceId);
    const provider = new LocalProvider();
    const result = await provider.compile(wsPath, rootResourcePath, options);

    const urls: { pdfUrl?: string; logUrl?: string; synctexUrl?: string } = {};
    if (result.artifacts?.pdfPath) {
      const ref = this.artifacts.putExisting(result.artifacts.pdfPath);
      urls.pdfUrl = this.artifacts.signUrl(ref).url;
    }
    if (result.artifacts?.logPath) {
      const ref = this.artifacts.putExisting(result.artifacts.logPath);
      urls.logUrl = this.artifacts.signUrl(ref).url;
    }
    if (result.artifacts?.synctexPath) {
      try { await fs.access(result.artifacts.synctexPath); const ref = this.artifacts.putExisting(result.artifacts.synctexPath); urls.synctexUrl = this.artifacts.signUrl(ref).url; } catch {}
    }
    return { result, artifacts: urls };
  }

  compileAsync(workspaceId: string, rootResourcePath: string, options: CompileOptions, ops: OperationManager<any, any>): string {
    const key = `${workspaceId}::${rootResourcePath}`;
    const existing = this.pending.get(key);
    if (existing) {
      const op = ops.get(existing);
      if (op && (op.state === 'queued' || op.state === 'running')) {
        return existing;
      }
    }
    const id = ops.create({ workspaceId, rootResourcePath, options }, async () => {
      const out = await this.compileSync(workspaceId, rootResourcePath, options);
      return out;
    });
    this.pending.set(key, id);
    return id;
  }
}
