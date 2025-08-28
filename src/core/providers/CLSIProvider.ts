import { CompileProvider, CompileOptions, CompileResult } from './CompileProvider';

export class CLSIProvider implements CompileProvider {
  async compile(projectPath: string, rootResourcePath: string, options: CompileOptions): Promise<CompileResult> {
    // Stub: call CLSI endpoints based on configuration
    return {
      diagnostics: [
        {
          severity: 'info',
          message: 'CLSIProvider compile stub (no-op) executed',
        },
      ],
    };
  }
}
