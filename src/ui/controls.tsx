import { useState, type ReactNode } from 'react';
import type { ValidationIssue } from '../generator/types';

export function issuesFor(issues: ValidationIssue[], field: string): ValidationIssue[] {
  return issues.filter(
    (issue) => issue.field === field || issue.field.startsWith(`${field}.`),
  );
}

export function fieldLevel(
  issues: ValidationIssue[],
  field: string,
): 'error' | 'warning' | undefined {
  const matches = issuesFor(issues, field);
  if (matches.some((issue) => issue.level === 'error')) return 'error';
  if (matches.some((issue) => issue.level === 'warning')) return 'warning';
  return undefined;
}

function Messages({
  issues,
  field,
  id,
}: {
  issues?: ValidationIssue[];
  field?: string;
  id: string;
}) {
  if (!issues || !field) return null;
  const matches = issuesFor(issues, field);
  if (matches.length === 0) return null;
  return (
    <div className="messages" id={id}>
      {matches.slice(0, 6).map((issue, index) => (
        <p key={`${issue.level}-${index}`} className={`message ${issue.level}`}>
          {issue.message}
        </p>
      ))}
    </div>
  );
}

interface BaseProps {
  id: string;
  label: string;
  hint?: ReactNode;
  issues?: ValidationIssue[];
  field?: string;
}

interface TextInputProps extends BaseProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  mono?: boolean;
  inputMode?: 'text' | 'numeric' | 'decimal';
  disabled?: boolean;
}

export function TextInput({
  id,
  label,
  hint,
  issues,
  field,
  value,
  onChange,
  placeholder,
  mono,
  inputMode,
  disabled,
}: TextInputProps) {
  const level = field ? fieldLevel(issues ?? [], field) : undefined;
  const describedBy = `${id}-messages`;
  return (
    <div className={`field ${level ?? ''}`}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className={mono ? 'mono' : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        disabled={disabled}
        aria-invalid={level === 'error' || undefined}
        aria-describedby={level ? describedBy : undefined}
        spellCheck={false}
        autoComplete="off"
      />
      {hint ? <p className="hint">{hint}</p> : null}
      <Messages issues={issues} field={field} id={describedBy} />
    </div>
  );
}

interface SelectProps extends BaseProps {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
}

export function SelectInput({
  id,
  label,
  hint,
  issues,
  field,
  value,
  onChange,
  options,
  disabled,
}: SelectProps) {
  const level = field ? fieldLevel(issues ?? [], field) : undefined;
  return (
    <div className={`field ${level ?? ''}`}>
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        aria-invalid={level === 'error' || undefined}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? <p className="hint">{hint}</p> : null}
      <Messages issues={issues} field={field} id={`${id}-messages`} />
    </div>
  );
}

interface CheckboxProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: ReactNode;
  disabled?: boolean;
}

export function Checkbox({ id, label, checked, onChange, hint, disabled }: CheckboxProps) {
  return (
    <div className="checkbox-row">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
      />
      <div>
        <label htmlFor={id}>{label}</label>
        {hint ? <p className="hint">{hint}</p> : null}
      </div>
    </div>
  );
}

interface TagInputProps extends BaseProps {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  mono?: boolean;
}

export function TagInput({
  id,
  label,
  hint,
  issues,
  field,
  values,
  onChange,
  placeholder,
  mono,
}: TagInputProps) {
  const [draft, setDraft] = useState('');
  const level = field ? fieldLevel(issues ?? [], field) : undefined;

  const add = (raw: string) => {
    const parts = raw
      .split(/[\n,]+/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    const next = [...values];
    parts.forEach((part) => {
      if (!next.includes(part)) next.push(part);
    });
    onChange(next);
    setDraft('');
  };

  const remove = (value: string) => {
    onChange(values.filter((item) => item !== value));
  };

  return (
    <div className={`field ${level ?? ''}`}>
      <label htmlFor={id}>{label}</label>
      <div className="tag-input">
        <input
          id={id}
          className={mono ? 'mono' : undefined}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              add(draft);
            }
            if (event.key === 'Backspace' && draft === '' && values.length > 0) {
              remove(values[values.length - 1]);
            }
          }}
          onPaste={(event) => {
            const text = event.clipboardData.getData('text');
            if (/[\n,]/.test(text)) {
              event.preventDefault();
              add(text);
            }
          }}
          onBlur={() => add(draft)}
          placeholder={values.length === 0 ? placeholder : 'Add another…'}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={level === 'error' || undefined}
        />
      </div>
      {values.length > 0 ? (
        <div className="chips">
          {values.map((value) => (
            <span className={`chip ${mono ? 'mono' : ''}`} key={value}>
              {value}
              <button
                type="button"
                aria-label={`Remove ${value}`}
                onClick={() => remove(value)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      {hint ? <p className="hint">{hint}</p> : null}
      <Messages issues={issues} field={field} id={`${id}-messages`} />
    </div>
  );
}

export function StepHeader({
  title,
  description,
  children,
}: {
  title: string;
  description: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="step-header">
      <h2>{title}</h2>
      <p>{description}</p>
      {children}
    </header>
  );
}

export function Callout({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warning' | 'danger';
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className={`callout ${tone}`}>
      <strong>{title}</strong>
      {children ? <div>{children}</div> : null}
    </div>
  );
}
