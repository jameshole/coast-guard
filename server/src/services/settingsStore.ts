import fs from 'fs';
import path from 'path';
import os from 'os';

const DATA_DIR = path.join(os.homedir(), '.coast-guard');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

export interface ProjectSettings {
  /** Whether the server polls git status and pushes change events to clients */
  gitWatchEnabled: boolean;
}

const DEFAULTS: ProjectSettings = {
  gitWatchEnabled: true,
};

type SettingsFile = Record<string, Partial<ProjectSettings>>;

function load(): SettingsFile {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) as SettingsFile;
  } catch {
    return {};
  }
}

function save(data: SettingsFile): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2));
}

/**
 * Per-project settings persisted in ~/.coast-guard/settings.json, keyed by
 * absolute project path so a preference (e.g. git watching off for a huge repo)
 * sticks across server restarts.
 */
export class SettingsStore {
  private key: string;

  constructor(projectPath: string) {
    this.key = path.resolve(projectPath);
  }

  get(): ProjectSettings {
    const stored = load()[this.key] ?? {};
    return { ...DEFAULTS, ...stored };
  }

  update(patch: Partial<ProjectSettings>): ProjectSettings {
    const all = load();
    const next = { ...DEFAULTS, ...(all[this.key] ?? {}), ...patch };
    all[this.key] = next;
    save(all);
    return next;
  }
}
