import type { Config } from '../generator/types';
import { hydrateConfig } from './hydrate';

const STORAGE_KEY = 'mikrotik-toolkit-config-v1';

export function loadStoredConfig(): Config | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return hydrateConfig(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveStoredConfig(config: Config): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Private windows and blocked storage: the generator still works.
  }
}

export function clearStoredConfig(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore.
  }
}
