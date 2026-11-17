import type { Config, ValidationIssue } from '../generator/types';

export type Update = (mutator: (draft: Config) => void) => void;

export interface StepProps {
  config: Config;
  update: Update;
  issues: ValidationIssue[];
}
