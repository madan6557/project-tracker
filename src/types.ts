export type ProgressStatus = 'todo' | 'in_progress' | 'review' | 'done';

export interface ProjectMeta {
  projectName: string;
  subtitle: string;
  poweredBy: string;
  fps: number;
  animaticFps: number;
  totalSequences: number;
  totalShots: number;
  totalFrames: number;
  totalDurationSec: number;
  sourceShotPlan: string;
  updatedAt: string;
}

export interface StageDefinition {
  id: string;
  name: string;
  shortName: string;
  description: string;
  accentColor: string;
}

export interface ShotDefinition {
  id: string; // e.g. "SQ01-SH01"
  no: number;
  code: string; // e.g. "SH01"
  fullCode: string; // e.g. "SQ01 — SH01"
  frames6fps: string;
  frames60fps: string;
  frameCount60fps: number;
  timeRange: string;
  durationSec: number;
  summary: string;
}

export interface SequenceDefinition {
  id: string; // e.g. "SQ01"
  folderName: string;
  title: string;
  timeRange: string;
  durationSec: number;
  totalFrames: number;
  shots: ShotDefinition[];
}

export interface ProgressEntry {
  status: ProgressStatus;
  version?: string;
  note?: string;
  updatedAt?: string;
}

export interface ProjectProgressDocument {
  schemaVersion: number;
  meta: ProjectMeta;
  stages: StageDefinition[];
  sequences: SequenceDefinition[];
  progress: Record<string, Record<string, ProgressEntry>>;
}

export interface SequenceStats {
  total: number;
  done: number;
  review: number;
  inProgress: number;
  todo: number;
  percent: number;
  derivedStatus: ProgressStatus;
}

export interface StageStats {
  total: number;
  done: number;
  review: number;
  inProgress: number;
  todo: number;
  percent: number;
  weightedPercent: number;
}
