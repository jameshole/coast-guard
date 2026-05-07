export type RunStatus = 'running' | 'done' | 'failed' | 'stopped';

export interface RunState {
  runId: string;
  scriptName: string;
  command: string;
  status: RunStatus;
  startedAt: number;
  endedAt: number | null;
  exitCode: number | null;
  signal: string | null;
}

export type ScriptKind = 'preset' | 'package';

export interface ScriptDefinition {
  name: string;
  command: string;
  kind: ScriptKind;
}

export interface ScriptUpdateMessage {
  type: 'scriptUpdate';
  state: RunState;
}

export interface ScriptOutputMessage {
  type: 'scriptOutput';
  runId: string;
  line: string;
}

export type ScriptWsMessage = ScriptUpdateMessage | ScriptOutputMessage;
