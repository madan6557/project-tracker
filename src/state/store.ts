import type {
  ProgressEntry,
  ProgressStatus,
  ProjectProgressDocument,
  ResolvedThumbnail,
  SequenceDefinition,
  SequenceStats,
  ShotDefinition,
  StageStats,
} from '../types';

const DRAFT_STORAGE_KEY = 'twinkle_tracker_draft_v1';
const ADMIN_SESSION_KEY = 'twinkle_tracker_admin_v1';

export const STATUS_ORDER: ProgressStatus[] = ['todo', 'in_progress', 'review', 'done'];

export const STATUS_LABELS: Record<ProgressStatus, string> = {
  todo: 'Uncharted',
  in_progress: 'In Progress',
  review: 'In Review',
  done: 'Completed',
};

export const STATUS_GLYPHS: Record<ProgressStatus, string> = {
  todo: '○',
  in_progress: '◐',
  review: '◆',
  done: '★',
};

type Listener = () => void;

class TrackerStore {
  private publishedDoc: ProjectProgressDocument | null = null;
  private doc: ProjectProgressDocument | null = null;
  private hasDraft = false;
  private adminUnlocked = false;
  private activeStageId = 'blocking';
  private editMode = false;
  private viewMode: 'map' | 'tree' = 'map';
  private filterStatus: 'all' | ProgressStatus = 'all';
  private searchQuery = '';
  private expandedSeqs = new Set<string>();
  private listeners = new Set<Listener>();

  private computeDefaultExpandedSeqs(stageId: string): Set<string> {
    const next = new Set<string>();
    if (!this.doc) return next;
    for (const seq of this.doc.sequences) {
      const hasActiveShot = seq.shots.some((shot) => {
        const status = this.getShotEntry(stageId, shot.id).status;
        return status === 'in_progress' || status === 'review' || status === 'done';
      });
      if (hasActiveShot) next.add(seq.id);
    }
    return next;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  private applySavedDraftIfAny(): void {
    if (!this.doc) return;
    const savedDraft = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!savedDraft) return;
    try {
      const draftProgress = JSON.parse(savedDraft) as Record<string, Record<string, ProgressEntry>>;
      if (draftProgress && typeof draftProgress === 'object') {
        this.doc.progress = draftProgress;
        this.hasDraft = true;
      }
    } catch {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
    }
  }

  async init(): Promise<void> {
    const resp = await fetch('./data/progress.json', { cache: 'no-cache' });
    if (!resp.ok) {
      throw new Error(`Gagal memuat data progres (${resp.status})`);
    }
    const raw = (await resp.json()) as ProjectProgressDocument;
    this.publishedDoc = structuredClone(raw);
    this.doc = structuredClone(raw);

    const params = new URLSearchParams(window.location.search);
    const hasAdminParam = params.get('admin') === '1' || params.get('edit') === '1';
    if (hasAdminParam || sessionStorage.getItem(ADMIN_SESSION_KEY) === '1') {
      this.adminUnlocked = true;
      sessionStorage.setItem(ADMIN_SESSION_KEY, '1');
      this.applySavedDraftIfAny();
    }

    if (this.doc.stages.length > 0 && !this.doc.stages.some((s) => s.id === this.activeStageId)) {
      this.activeStageId = this.doc.stages[0].id;
    }

    this.expandedSeqs = this.computeDefaultExpandedSeqs(this.activeStageId);
    this.emit();
  }

  getDoc(): ProjectProgressDocument | null {
    return this.doc;
  }

  getHasDraft(): boolean {
    return this.hasDraft;
  }

  isAdminUnlocked(): boolean {
    return this.adminUnlocked;
  }

  unlockAdmin(): void {
    if (this.adminUnlocked) return;
    this.adminUnlocked = true;
    sessionStorage.setItem(ADMIN_SESSION_KEY, '1');
    this.applySavedDraftIfAny();
    this.expandedSeqs = this.computeDefaultExpandedSeqs(this.activeStageId);
    this.emit();
  }

  lockAdmin(): void {
    if (!this.adminUnlocked) return;
    this.adminUnlocked = false;
    this.editMode = false;
    this.hasDraft = false;
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    if (this.publishedDoc) {
      this.doc = structuredClone(this.publishedDoc);
    }
    this.expandedSeqs = this.computeDefaultExpandedSeqs(this.activeStageId);
    this.emit();
  }

  toggleAdminUnlocked(): void {
    if (this.adminUnlocked) this.lockAdmin();
    else this.unlockAdmin();
  }

  getActiveStageId(): string {
    return this.activeStageId;
  }

  setActiveStage(stageId: string): void {
    if (this.activeStageId === stageId) return;
    this.activeStageId = stageId;
    this.expandedSeqs = this.computeDefaultExpandedSeqs(stageId);
    this.emit();
  }

  isEditMode(): boolean {
    return this.adminUnlocked && this.editMode;
  }

  toggleEditMode(): void {
    if (!this.adminUnlocked) return;
    this.editMode = !this.editMode;
    this.emit();
  }

  getViewMode(): 'map' | 'tree' {
    return this.viewMode;
  }

  setViewMode(mode: 'map' | 'tree'): void {
    if (this.viewMode === mode) return;
    this.viewMode = mode;
    this.emit();
  }

  getFilterStatus(): 'all' | ProgressStatus {
    return this.filterStatus;
  }

  setFilterStatus(status: 'all' | ProgressStatus): void {
    this.filterStatus = status;
    this.emit();
  }

  getSearchQuery(): string {
    return this.searchQuery;
  }

  setSearchQuery(query: string): void {
    this.searchQuery = query.trim();
    this.emit();
  }

  isSeqExpanded(sqId: string): boolean {
    return this.expandedSeqs.has(sqId);
  }

  toggleSeqExpanded(sqId: string): void {
    if (this.expandedSeqs.has(sqId)) {
      this.expandedSeqs.delete(sqId);
    } else {
      this.expandedSeqs.add(sqId);
    }
    this.emit();
  }

  expandAllSeqs(): void {
    if (!this.doc) return;
    for (const seq of this.doc.sequences) this.expandedSeqs.add(seq.id);
    this.emit();
  }

  collapseAllSeqs(): void {
    this.expandedSeqs.clear();
    this.emit();
  }

  getShotEntry(stageId: string, shotKey: string): ProgressEntry {
    const entry = this.doc?.progress?.[stageId]?.[shotKey];
    if (!entry) return { status: 'todo' };
    return entry;
  }

  resolveShotThumbnail(stageId: string, shot: ShotDefinition): ResolvedThumbnail | null {
    const doc = this.doc;
    if (!doc) return null;
    const stageIdx = doc.stages.findIndex((s) => s.id === stageId);
    const activeStage = stageIdx >= 0 ? doc.stages[stageIdx] : undefined;
    const entry = this.getShotEntry(stageId, shot.id);

    if (entry.thumbnail) {
      return {
        url: entry.thumbnail,
        badge: `Stage: ${activeStage?.shortName ?? stageId}`,
        isFallback: false,
        refUrl: shot.refThumbnail,
      };
    }

    if (stageId === 'blocking' && shot.refThumbnail) {
      return {
        url: shot.refThumbnail,
        badge: 'Ref: Animatic',
        isFallback: false,
      };
    }

    for (let i = stageIdx - 1; i >= 0; i--) {
      const prevStage = doc.stages[i];
      const prevEntry = this.getShotEntry(prevStage.id, shot.id);
      if (prevEntry.thumbnail) {
        return {
          url: prevEntry.thumbnail,
          badge: `Fallback: ${prevStage.shortName}`,
          isFallback: true,
          refUrl: shot.refThumbnail,
        };
      }
    }

    if (shot.refThumbnail) {
      return {
        url: shot.refThumbnail,
        badge: 'Ref: Animatic',
        isFallback: true,
      };
    }

    return null;
  }

  getSequenceStats(stageId: string, seq: SequenceDefinition): SequenceStats {
    let done = 0;
    let review = 0;
    let inProgress = 0;
    let todo = 0;

    for (const shot of seq.shots) {
      const status = this.getShotEntry(stageId, shot.id).status;
      if (status === 'done') done++;
      else if (status === 'review') review++;
      else if (status === 'in_progress') inProgress++;
      else todo++;
    }

    const total = seq.shots.length;
    const weighted = done + review * 0.75 + inProgress * 0.4;
    const percent = total > 0 ? Math.round((weighted / total) * 100) : 0;

    let derivedStatus: ProgressStatus = 'todo';
    if (done === total && total > 0) derivedStatus = 'done';
    else if (review > 0 && done + review === total) derivedStatus = 'review';
    else if (done > 0 || review > 0 || inProgress > 0) derivedStatus = 'in_progress';

    return { total, done, review, inProgress, todo, percent, derivedStatus };
  }

  getStageStats(stageId: string): StageStats {
    if (!this.doc) {
      return { total: 0, done: 0, review: 0, inProgress: 0, todo: 0, percent: 0, weightedPercent: 0 };
    }
    let total = 0;
    let done = 0;
    let review = 0;
    let inProgress = 0;
    let todo = 0;

    for (const seq of this.doc.sequences) {
      for (const shot of seq.shots) {
        total++;
        const st = this.getShotEntry(stageId, shot.id).status;
        if (st === 'done') done++;
        else if (st === 'review') review++;
        else if (st === 'in_progress') inProgress++;
        else todo++;
      }
    }

    const percent = total > 0 ? Math.round((done / total) * 100) : 0;
    const weightedPercent =
      total > 0 ? Math.round(((done + review * 0.75 + inProgress * 0.4) / total) * 100) : 0;
    return { total, done, review, inProgress, todo, percent, weightedPercent };
  }

  getOverallStats(): { completedUnits: number; totalUnits: number; percent: number } {
    if (!this.doc) return { completedUnits: 0, totalUnits: 0, percent: 0 };
    const totalUnits = this.doc.stages.length * this.doc.meta.totalShots;
    let completedUnits = 0;
    let weightedUnits = 0;
    for (const stage of this.doc.stages) {
      const st = this.getStageStats(stage.id);
      completedUnits += st.done;
      weightedUnits += st.done + st.review * 0.75 + st.inProgress * 0.4;
    }
    const percent = totalUnits > 0 ? Math.round((weightedUnits / totalUnits) * 100) : 0;
    return { completedUnits, totalUnits, percent };
  }

  private persistDraft(): void {
    if (!this.doc) return;
    this.doc.meta.updatedAt = new Date().toISOString();
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(this.doc.progress));
    this.hasDraft = true;
    this.emit();
  }

  updateShotEntry(stageId: string, shotKey: string, patch: Partial<ProgressEntry>): void {
    if (!this.doc) return;
    if (!this.doc.progress[stageId]) this.doc.progress[stageId] = {};
    const prev = this.doc.progress[stageId][shotKey] ?? { status: 'todo' };
    const next: ProgressEntry = {
      ...prev,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    if (!next.version) delete next.version;
    if (!next.note) delete next.note;
    if (!next.thumbnail) delete next.thumbnail;
    this.doc.progress[stageId][shotKey] = next;
    if (stageId === this.activeStageId && next.status !== 'todo') {
      const ownerSeq = this.doc.sequences.find((sq) => sq.shots.some((sh) => sh.id === shotKey));
      if (ownerSeq) this.expandedSeqs.add(ownerSeq.id);
    }
    this.persistDraft();
  }

  updateSequenceStatus(
    stageId: string,
    seq: SequenceDefinition,
    status: ProgressStatus,
    version?: string,
    note?: string,
  ): void {
    if (!this.doc) return;
    if (!this.doc.progress[stageId]) this.doc.progress[stageId] = {};
    const now = new Date().toISOString();
    for (const shot of seq.shots) {
      const prev = this.doc.progress[stageId][shot.id] ?? { status: 'todo' };
      const next: ProgressEntry = {
        ...prev,
        status,
        updatedAt: now,
      };
      if (version !== undefined) {
        if (version.trim()) next.version = version.trim();
        else delete next.version;
      }
      if (note !== undefined) {
        if (note.trim()) next.note = note.trim();
        else delete next.note;
      }
      this.doc.progress[stageId][shot.id] = next;
    }
    if (stageId === this.activeStageId && status !== 'todo') {
      this.expandedSeqs.add(seq.id);
    }
    this.persistDraft();
  }

  resetDraft(): void {
    if (!this.publishedDoc) return;
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    this.doc = structuredClone(this.publishedDoc);
    this.hasDraft = false;
    this.expandedSeqs = this.computeDefaultExpandedSeqs(this.activeStageId);
    this.emit();
  }

  exportJsonString(): string {
    return JSON.stringify(this.doc, null, 2) + '\n';
  }

  importJsonString(raw: string): void {
    const parsed = JSON.parse(raw) as ProjectProgressDocument;
    if (!parsed || !Array.isArray(parsed.stages) || !Array.isArray(parsed.sequences) || !parsed.progress) {
      throw new Error('Format file progress.json tidak valid.');
    }
    this.doc = parsed;
    this.expandedSeqs = this.computeDefaultExpandedSeqs(this.activeStageId);
    this.persistDraft();
  }
}

export const store = new TrackerStore();
