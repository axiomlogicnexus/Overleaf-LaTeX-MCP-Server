import { spawn } from 'node:child_process';
import { CompileProvider, CompileOptions, CompileResult } from './CompileProvider';

export class LocalProvider implements CompileProvider {
  async compile(projectPath: string, rootResourcePath: string, options: CompileOptions): Promise<CompileResult> {
    // Stub: detect latexmk/xelatex and run with safe defaults
    // For now, return a placeholder to satisfy interfaces
    return {
      diagnostics: [
        {
          severity: 'info',
          message: 'LocalProvider compile stub (no-op) executed',
        },
      ],
    };
  }
}
