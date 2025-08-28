export type CompileOptions = {
  compiler?: 'pdflatex' | 'xelatex' | 'lualatex' | 'latexmk';
  outputFormat?: 'pdf' | 'dvi' | 'ps';
  synctex?: boolean;
  shellEscape?: 'off' | 'restricted' | 'on';
  timeoutMs?: number;
};

export type Diagnostic = {
  severity: 'error' | 'warning' | 'info';
  file?: string;
  line?: number;
  code?: string;
  message: string;
};

export type CompileResult = {
  diagnostics: Diagnostic[];
  artifacts?: {
    pdfPath?: string;
    logPath?: string;
    synctexPath?: string;
  };
};

export interface CompileProvider {
  compile(projectPath: string, rootResourcePath: string, options: CompileOptions): Promise<CompileResult>;
}
