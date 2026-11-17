import { useMemo, useState, type ReactNode } from 'react';
import type { GenerationResult } from '../generator/output';
import type { GeneratedFile } from '../generator/types';
import { Callout, StepHeader } from './controls';
import { copyText } from './download';
import type { StepProps } from './appTypes';

function CodeLine({ line }: { line: string }) {
  if (/^\s*#/.test(line)) {
    return <span className="tok-comment">{line}</span>;
  }
  const pathMatch = /^(\s*)(\/\S+)(.*)$/.exec(line);
  const prefix = pathMatch ? pathMatch[2] : '';
  const rest = pathMatch ? pathMatch[1] + pathMatch[3] : line;
  const leading = pathMatch ? pathMatch[1] : '';
  const parts = rest.split(/("(?:\\.|[^"])*")/g);
  return (
    <>
      {leading}
      {prefix ? <span className="tok-path">{prefix}</span> : null}
      {parts.map((part, index) =>
        part.startsWith('"') ? (
          <span className="tok-string" key={index}>
            {part}
          </span>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  );
}

function FilePreview({ file }: { file: GeneratedFile }) {
  const lines = useMemo(() => file.content.replace(/\n$/, '').split('\n'), [file]);
  return (
    <div className="code-wrap">
      <div className="code" role="region" aria-label={`${file.name} preview`}>
        {lines.map((line, index) => (
          <div className="code-line" key={index}>
            <span className="ln">{index + 1}</span>
            <span className="code-text">
              <CodeLine line={line} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function IssueList({
  title,
  issues,
  tone,
}: {
  title: string;
  issues: GenerationResult['issues'] | GenerationResult['lint'];
  tone: 'error' | 'warning';
}): ReactNode {
  if (issues.length === 0) return null;
  return (
    <div className={`issue-block ${tone}`}>
      <h4>
        {title} ({issues.length})
      </h4>
      <ul>
        {issues.slice(0, 40).map((issue, index) => (
          <li key={index}>
            {'field' in issue && issue.field ? (
              <code className="issue-field">{issue.field}</code>
            ) : null}
            {'line' in issue && issue.line ? (
              <code className="issue-field">line {issue.line}</code>
            ) : null}
            {issue.message}
          </li>
        ))}
      </ul>
      {issues.length > 40 ? <p className="hint">Showing the first 40 issues.</p> : null}
    </div>
  );
}

interface ReviewProps extends StepProps {
  result: GenerationResult;
  onDownload: (file: GeneratedFile) => void;
  onDownloadAll: () => void;
}

export function StepReview({
  config,
  issues,
  result,
  onDownload,
  onDownloadAll,
}: ReviewProps) {
  const [activeName, setActiveName] = useState(result.files[0]?.name ?? '');
  const active = result.files.find((file) => file.name === activeName) ?? result.files[0];
  const errors = issues.filter((issue) => issue.level === 'error');
  const warnings = issues.filter((issue) => issue.level === 'warning');
  const lintErrors = result.lint.filter((issue) => issue.level === 'error');
  const lintWarnings = result.lint.filter((issue) => issue.level === 'warning');
  const blocked = errors.length > 0 || lintErrors.length > 0;

  return (
    <>
      <StepHeader
        title="Review & generate"
        description="The package is generated in this browser. Nothing is uploaded. Review the warnings, the lint results, then download the files and import them in the listed order."
      />

      <div className="stat-row">
        <div className={`stat ${errors.length > 0 ? 'bad' : 'good'}`}>
          <span className="stat-value">{errors.length}</span>
          <span className="stat-label">blocking errors</span>
        </div>
        <div className={`stat ${warnings.length > 0 ? 'warn' : 'good'}`}>
          <span className="stat-value">{warnings.length}</span>
          <span className="stat-label">warnings</span>
        </div>
        <div className={`stat ${lintErrors.length > 0 ? 'bad' : 'good'}`}>
          <span className="stat-value">{lintErrors.length}</span>
          <span className="stat-label">script lint errors</span>
        </div>
        <div className="stat">
          <span className="stat-value">{result.files.length}</span>
          <span className="stat-label">files</span>
        </div>
      </div>

      {blocked ? (
        <Callout tone="danger" title="Fix blocking issues before importing">
          Downloads are disabled while a blocking validation or lint error
          remains. The preview is still available.
        </Callout>
      ) : (
        <Callout tone="info" title="Generated package is internally consistent">
          Configuration id <code>{result.meta.configId}</code>, generated{' '}
          {result.meta.generatedAt}. Lint checks cover brace balance, filter-chain
          and template references, afi/network-list mismatches, and the
          default-drop staging.
        </Callout>
      )}

      <div className="review-grid">
        <section>
          <h3>Validation</h3>
          <IssueList title="Errors" issues={errors} tone="error" />
          <IssueList title="Warnings" issues={warnings} tone="warning" />
          {errors.length === 0 && warnings.length === 0 ? (
            <p className="good-text">No validation issues.</p>
          ) : null}
          <h3>Script lint</h3>
          <IssueList title="Lint errors" issues={lintErrors} tone="error" />
          <IssueList title="Lint warnings" issues={lintWarnings} tone="warning" />
          {result.lint.length === 0 ? (
            <p className="good-text">No lint issues in the generated RouterOS files.</p>
          ) : null}
        </section>

        <section>
          <h3>Import order</h3>
          <ol className="steps-list">
            <li>
              <strong>00-preflight.rsc</strong> — version gate and backup.
            </li>
            <li>
              <strong>10-firewall.rsc</strong> — default-drop rules installed disabled.
            </li>
            <li>Verify management access from a new session.</li>
            <li>
              <strong>20-bgp.rsc</strong> — sessions and filters.
            </li>
            <li>Verify BGP sessions and advertisements.</li>
            <li>
              <strong>90-finalize.rsc</strong> — enable default-deny.
            </li>
          </ol>
          <p className="hint">
            Keep a second access path open. Restore <code>pre-gen-backup.backup</code>{' '}
            if anything fails.
          </p>
        </section>
      </div>

      <div className="files">
        <div className="file-tabs" role="tablist" aria-label="Generated files">
          {result.files.map((file) => (
            <button
              key={file.name}
              type="button"
              role="tab"
              aria-selected={file.name === active?.name}
              className={`file-tab ${file.name === active?.name ? 'active' : ''}`}
              onClick={() => setActiveName(file.name)}
            >
              {file.name}
            </button>
          ))}
        </div>
        {active ? (
          <>
            <div className="file-actions">
              <p>{active.description}</p>
              <div className="button-row">
                <a
                  className="button secondary small"
                  href={`data:text/plain;charset=utf-8,${encodeURIComponent(active.content)}`}
                  download={active.name}
                  onClick={(event) => {
                    event.preventDefault();
                    onDownload(active);
                  }}
                  aria-disabled={blocked}
                  style={blocked ? { pointerEvents: 'none', opacity: 0.5 } : undefined}
                >
                  Download {active.name}
                </a>
                <button
                  type="button"
                  className="button secondary small"
                  onClick={() => {
                    void copyText(active.content);
                  }}
                >
                  Copy
                </button>
              </div>
            </div>
            <FilePreview file={active} />
          </>
        ) : (
          <p className="muted">No files generated.</p>
        )}
      </div>

      <div className="download-row">
        <button
          type="button"
          className="button primary"
          disabled={blocked}
          onClick={onDownloadAll}
        >
          Download all files (.zip)
        </button>
        <button
          type="button"
          className="button secondary"
          onClick={() => {
            const blob = new Blob([JSON.stringify(config, null, 2)], {
              type: 'application/json',
            });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = 'mikrotik-config.json';
            anchor.click();
            URL.revokeObjectURL(url);
          }}
        >
          Download input JSON
        </button>
      </div>
    </>
  );
}
