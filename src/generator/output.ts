import { generateBgpFile } from './bgp';
import { generateFinalizeFile, generateFirewallFile } from './firewall';
import { lintRouterOS, type LintIssue } from './linter';
import { generatePreflightFile } from './preflight';
import { generateReadme } from './readme';
import {
  GENERATOR_VERSION,
  type Config,
  type GeneratedFile,
  type GenerationMeta,
  type ValidationIssue,
} from './types';
import { configId } from './utils';
import { validateConfig } from './validation';

export interface GenerationResult {
  meta: GenerationMeta;
  files: GeneratedFile[];
  issues: ValidationIssue[];
  lint: LintIssue[];
}

export function createMeta(config: Config, generatedAt?: string): GenerationMeta {
  return {
    generatedAt: generatedAt ?? new Date().toISOString(),
    generatorVersion: GENERATOR_VERSION,
    configId: configId(config),
  };
}

export function generatePackage(
  config: Config,
  generatedAt?: string,
): GenerationResult {
  const meta = createMeta(config, generatedAt);
  const issues = validateConfig(config);

  const configFile: GeneratedFile = {
    name: 'config.json',
    content: `${JSON.stringify(config, null, 2)}\n`,
    language: 'json',
    description: 'The generator input, for re-importing and reviewing later.',
  };

  const files = [
    generatePreflightFile(meta),
    generateFirewallFile(config, meta),
    generateBgpFile(config, meta),
    generateFinalizeFile(meta),
    generateReadme(config, meta, issues),
    configFile,
  ];

  const lint: LintIssue[] = [];
  files.forEach((file) => {
    if (file.language !== 'routeros') return;
    const kind = file.name.includes('firewall')
      ? 'firewall'
      : file.name.includes('bgp')
        ? 'bgp'
        : file.name.includes('preflight')
          ? 'preflight'
          : 'finalize';
    lint.push(...lintRouterOS(file.content, { config, file: kind }));
  });

  return { meta, files, issues, lint };
}
