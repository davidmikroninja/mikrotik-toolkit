import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createDefaultConfig } from './generator/defaults';
import { generatePackage, type GenerationResult } from './generator/output';
import {
  GENERATOR_VERSION,
  type Config,
  type GeneratedFile,
  type ValidationIssue,
} from './generator/types';
import { slug } from './generator/utils';
import { StepFirewall } from './ui/StepFirewall';
import { StepInterfaces } from './ui/StepInterfaces';
import { StepPeering } from './ui/StepPeering';
import { StepReview } from './ui/StepReview';
import { StepRouter } from './ui/StepRouter';
import { StepRpki } from './ui/StepRpki';
import { StepTransits } from './ui/StepTransits';
import { hydrateConfig } from './ui/hydrate';
import { clearStoredConfig, loadStoredConfig, saveStoredConfig } from './ui/storage';
import { downloadBlob, downloadText } from './ui/download';
import { createZip } from './ui/zip';

interface StepDefinition {
  id: string;
  title: string;
  short: string;
  prefixes: string[];
}

const STEPS: StepDefinition[] = [
  { id: 'router', title: 'Router & prefixes', short: 'Router', prefixes: ['router.', 'addressFamilies.', 'schemaVersion'] },
  { id: 'transits', title: 'Transits', short: 'Transits', prefixes: ['transits.'] },
  { id: 'peering', title: 'Peering', short: 'Peering', prefixes: ['peering.', 'priorities.'] },
  { id: 'rpki', title: 'RPKI', short: 'RPKI', prefixes: ['rpki.'] },
  { id: 'interfaces', title: 'Interfaces & management', short: 'Management', prefixes: ['interfaces.', 'management.'] },
  { id: 'firewall', title: 'Firewall policy', short: 'Firewall', prefixes: ['firewall.'] },
  { id: 'review', title: 'Review & generate', short: 'Review', prefixes: [] },
];

function countForStep(issues: ValidationIssue[], prefixes: string[]) {
  const matches =
    prefixes.length === 0
      ? issues
      : issues.filter((issue) =>
          prefixes.some((prefix) => issue.field === prefix || issue.field.startsWith(prefix)),
        );
  return {
    errors: matches.filter((issue) => issue.level === 'error').length,
    warnings: matches.filter((issue) => issue.level === 'warning').length,
  };
}

function mimeFor(file: GeneratedFile): string {
  if (file.language === 'json') return 'application/json;charset=utf-8';
  return 'text/plain;charset=utf-8';
}

function App() {
  const [config, setConfig] = useState<Config>(() => loadStoredConfig() ?? createDefaultConfig());
  const [stepIndex, setStepIndex] = useState(0);
  const [generatedAt, setGeneratedAt] = useState(() => new Date().toISOString());
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const update = useCallback((mutator: (draft: Config) => void) => {
    setConfig((previous) => {
      const next =
        typeof structuredClone === 'function'
          ? structuredClone(previous)
          : (JSON.parse(JSON.stringify(previous)) as Config);
      mutator(next);
      return next;
    });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => saveStoredConfig(config), 250);
    return () => window.clearTimeout(timer);
  }, [config]);

  const result = useMemo<GenerationResult>(() => {
    try {
      return generatePackage(config, generatedAt);
    } catch (error) {
      return {
        meta: {
          generatedAt,
          generatorVersion: GENERATOR_VERSION,
          configId: 'error',
        },
        files: [],
        issues: [
          {
            level: 'error',
            field: '',
            message: `The generator crashed: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        lint: [],
      };
    }
  }, [config, generatedAt]);

  const issues = result.issues;
  const totalErrors = issues.filter((issue) => issue.level === 'error').length;
  const step = STEPS[stepIndex];

  const downloadFile = useCallback((file: GeneratedFile) => {
    downloadText(file.name, file.content, mimeFor(file));
  }, []);

  const downloadAll = useCallback(() => {
    const zip = createZip(
      result.files.map((file) => ({ name: file.name, content: file.content })),
      new Date(generatedAt),
    );
    const name = `mikrotik-${slug(config.router.name || 'edge')}-${result.meta.configId}.zip`;
    downloadBlob(name, zip);
  }, [config.router.name, generatedAt, result]);

  const loadFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      setConfig(hydrateConfig(parsed));
      setStepIndex(0);
      setGeneratedAt(new Date().toISOString());
      setNotice(`Loaded ${file.name}.`);
    } catch (error) {
      setNotice(`Could not load ${file.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const reset = () => {
    if (!window.confirm('Discard the current form and start from defaults?')) return;
    clearStoredConfig();
    setConfig(createDefaultConfig());
    setStepIndex(0);
    setGeneratedAt(new Date().toISOString());
    setNotice('Form reset to defaults.');
  };

  const saveInput = () => {
    downloadText(
      `mikrotik-config-${slug(config.router.name || 'edge')}.json`,
      `${JSON.stringify(config, null, 2)}\n`,
      'application/json;charset=utf-8',
    );
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">M</span>
          <div>
            <h1>MikroTik Edge Config Generator</h1>
            <p>
              RouterOS 7.20+ firewall and BGP, generated locally in your browser.
              Nothing is uploaded.
            </p>
          </div>
        </div>
        <div className="topbar-actions">
          <button type="button" className="button secondary small" onClick={saveInput}>
            Save input
          </button>
          <button
            type="button"
            className="button secondary small"
            onClick={() => fileInput.current?.click()}
          >
            Load input
          </button>
          <button type="button" className="button danger small" onClick={reset}>
            Reset
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void loadFile(file);
              event.target.value = '';
            }}
          />
        </div>
      </header>

      {notice ? (
        <div className="notice" role="status">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      ) : null}

      {totalErrors > 0 ? (
        <div className="notice danger" role="alert">
          <span>
            {totalErrors} blocking validation {totalErrors === 1 ? 'error' : 'errors'}.
            Open Review to see the details; downloads are disabled until they are fixed.
          </span>
          <button type="button" onClick={() => setStepIndex(STEPS.length - 1)}>
            Review
          </button>
        </div>
      ) : null}

      <div className="app-grid">
        <aside className="sidebar" aria-label="Steps">
          <nav>
            {STEPS.map((definition, index) => {
              const counts = countForStep(issues, definition.prefixes);
              return (
                <button
                  key={definition.id}
                  type="button"
                  className={`nav-item ${index === stepIndex ? 'active' : ''}`}
                  onClick={() => setStepIndex(index)}
                  aria-current={index === stepIndex ? 'step' : undefined}
                >
                  <span className="nav-number">{index + 1}</span>
                  <span className="nav-label">
                    <span>{definition.title}</span>
                    <span className="nav-status">
                      {counts.errors > 0 ? (
                        <span className="badge error">{counts.errors} error{counts.errors === 1 ? '' : 's'}</span>
                      ) : null}
                      {counts.warnings > 0 ? (
                        <span className="badge warning">{counts.warnings}</span>
                      ) : null}
                      {counts.errors === 0 && counts.warnings === 0 ? (
                        <span className="badge ok">ok</span>
                      ) : null}
                    </span>
                  </span>
                </button>
              );
            })}
          </nav>
          <div className="sidebar-note">
            <p>
              Target RouterOS <strong>7.20+</strong>. The generator emits{' '}
              <code>afi=</code>, full property names, and applies RPKI where enabled.
            </p>
            <p className="muted">v{GENERATOR_VERSION}</p>
          </div>
        </aside>

        <main className="panel">
          {step.id === 'router' ? <StepRouter config={config} update={update} issues={issues} /> : null}
          {step.id === 'transits' ? <StepTransits config={config} update={update} issues={issues} /> : null}
          {step.id === 'peering' ? <StepPeering config={config} update={update} issues={issues} /> : null}
          {step.id === 'rpki' ? <StepRpki config={config} update={update} issues={issues} /> : null}
          {step.id === 'interfaces' ? <StepInterfaces config={config} update={update} issues={issues} /> : null}
          {step.id === 'firewall' ? <StepFirewall config={config} update={update} issues={issues} /> : null}
          {step.id === 'review' ? (
            <StepReview
              config={config}
              update={update}
              issues={issues}
              result={result}
              onDownload={downloadFile}
              onDownloadAll={downloadAll}
            />
          ) : null}

          {step.id !== 'review' ? (
            <footer className="wizard-footer">
              <button
                type="button"
                className="button secondary"
                disabled={stepIndex === 0}
                onClick={() => setStepIndex((index) => Math.max(0, index - 1))}
              >
                Back
              </button>
              <span className="muted">
                Step {stepIndex + 1} of {STEPS.length}: {step.short}
              </span>
              <button
                type="button"
                className="button primary"
                onClick={() => setStepIndex((index) => Math.min(STEPS.length - 1, index + 1))}
              >
                {stepIndex === STEPS.length - 2 ? 'Review' : 'Next'}
              </button>
            </footer>
          ) : null}
        </main>
      </div>
    </div>
  );
}

export default App;
