import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

const PolicySchema = z.object({
  shellEscape: z.enum(['off', 'restricted', 'on']).default('off'),
  allowedExtensions: z.array(z.string()).default(['.tex', '.bib', '.sty', '.cls', '.png', '.jpg', '.jpeg', '.pdf', '.eps', '.svg', '.txt', '.bst']),
  maxFileSizeBytes: z.number().default(10 * 1024 * 1024),
  maxProjectSizeBytes: z.number().default(200 * 1024 * 1024),
  allowedCompilers: z.array(z.enum(['pdflatex', 'xelatex', 'lualatex', 'latexmk'])).default(['pdflatex', 'xelatex', 'lualatex', 'latexmk']),
});

const ProjectSchema = z.object({
  name: z.string(),
  projectId: z.string(),
  gitUrl: z.string().optional(),
  policy: PolicySchema.partial().optional(),
});

const ConfigSchema = z.object({
  projects: z.record(ProjectSchema).default({}),
  defaultPolicy: PolicySchema.default({} as any),
});

export type Policy = z.infer<typeof PolicySchema>;
export type ProjectConfig = z.infer<typeof ProjectSchema>;
export type AppConfig = z.infer<typeof ConfigSchema>;

export async function loadConfig(cwd: string): Promise<AppConfig> {
  const p = path.resolve(cwd, 'projects.json');
  try {
    const raw = await fs.readFile(p, 'utf-8');
    const parsed = JSON.parse(raw);
    const cfg = ConfigSchema.parse(parsed);
    return cfg;
  } catch {
    // default empty config
    return ConfigSchema.parse({});
  }
}

export function resolvePolicy(projectKey: string, cfg: AppConfig): Policy {
  const p = cfg.projects[projectKey];
  const merged: Policy = {
    shellEscape: p?.policy?.shellEscape ?? cfg.defaultPolicy.shellEscape,
    allowedExtensions: p?.policy?.allowedExtensions ?? cfg.defaultPolicy.allowedExtensions,
    maxFileSizeBytes: p?.policy?.maxFileSizeBytes ?? cfg.defaultPolicy.maxFileSizeBytes,
    maxProjectSizeBytes: p?.policy?.maxProjectSizeBytes ?? cfg.defaultPolicy.maxProjectSizeBytes,
    allowedCompilers: p?.policy?.allowedCompilers ?? cfg.defaultPolicy.allowedCompilers,
  };
  return merged;
}

export function isAllowedExtension(filePath: string, policy: Policy): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return policy.allowedExtensions.includes(ext);
}
