import { STATUS_GLYPHS, STATUS_LABELS, store } from '../state/store';
import type { ProgressStatus, SequenceDefinition, ShotDefinition } from '../types';
import { escapeHtml } from '../utils/dialogHelpers';

export interface CanvasCallbacks {
  onSelectShot: (sqId: string, shot: ShotDefinition) => void;
  onSelectSequence: (seq: SequenceDefinition) => void;
}

interface PositionedSeq {
  seq: SequenceDefinition;
  x: number;
  y: number;
  isTop: boolean;
  expanded: boolean;
  shots: Array<{ shot: ShotDefinition; x: number; y: number }>;
}

export class ProgressionCanvas {
  private mapSection: HTMLElement;
  private viewport: HTMLElement;
  private world: HTMLElement;
  private svgLayer: SVGSVGElement;
  private nodesLayer: HTMLElement;
  private treeSection: HTMLElement;
  private jumpStrip: HTMLElement;
  private zoomReadout: HTMLElement;
  private callbacks: CanvasCallbacks;

  private panX = 28;
  private panY = 20;
  private scale = 0.78;
  private hasInitialFit = false;
  private worldWidth = 3600;
  private worldHeight = 960;
  private seqCoords = new Map<string, { x: number; y: number }>();

  // Pointer drag & multi-touch pinch state
  private pointers = new Map<number, { x: number; y: number }>();
  private dragStartX = 0;
  private dragStartY = 0;
  private panStartX = 0;
  private panStartY = 0;
  private pinchStartDist = 0;
  private pinchStartScale = 1;
  private pinchLastMidX = 0;
  private pinchLastMidY = 0;
  private didDrag = false;

  constructor(
    els: {
      mapSection: HTMLElement;
      viewport: HTMLElement;
      world: HTMLElement;
      svgLayer: SVGSVGElement;
      nodesLayer: HTMLElement;
      treeSection: HTMLElement;
      jumpStrip: HTMLElement;
      zoomReadout: HTMLElement;
    },
    callbacks: CanvasCallbacks,
  ) {
    this.mapSection = els.mapSection;
    this.viewport = els.viewport;
    this.world = els.world;
    this.svgLayer = els.svgLayer;
    this.nodesLayer = els.nodesLayer;
    this.treeSection = els.treeSection;
    this.jumpStrip = els.jumpStrip;
    this.zoomReadout = els.zoomReadout;
    this.callbacks = callbacks;

    this.bindInteractions();
  }

  private bindInteractions(): void {
    // Pointer Pan & Two-Finger Pinch-to-Zoom (distinguishes drag >5px from tap/click)
    this.viewport.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this.pointers.size === 1) {
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        this.panStartX = this.panX;
        this.panStartY = this.panY;
        this.didDrag = false;
      } else if (this.pointers.size === 2) {
        const pts = Array.from(this.pointers.values());
        this.pinchStartDist = Math.max(1, Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y));
        this.pinchStartScale = this.scale;
        this.pinchLastMidX = (pts[0].x + pts[1].x) / 2;
        this.pinchLastMidY = (pts[0].y + pts[1].y) / 2;
        this.didDrag = true;
        this.viewport.classList.add('is-panning');
      }
    });

    window.addEventListener('pointermove', (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this.pointers.size === 2) {
        const pts = Array.from(this.pointers.values());
        const dist = Math.max(1, Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y));
        const midX = (pts[0].x + pts[1].x) / 2;
        const midY = (pts[0].y + pts[1].y) / 2;

        // Pan with midpoint movement
        this.panX += midX - this.pinchLastMidX;
        this.panY += midY - this.pinchLastMidY;
        this.pinchLastMidX = midX;
        this.pinchLastMidY = midY;

        // Zoom anchored at midpoint inside viewport
        const rect = this.viewport.getBoundingClientRect();
        this.zoomAt(this.pinchStartScale * (dist / this.pinchStartDist), midX - rect.left, midY - rect.top);
        return;
      }

      if (this.pointers.size === 1) {
        const dx = e.clientX - this.dragStartX;
        const dy = e.clientY - this.dragStartY;
        if (!this.didDrag && Math.hypot(dx, dy) > 5) {
          this.didDrag = true;
          this.viewport.classList.add('is-panning');
        }
        if (this.didDrag) {
          this.panX = this.panStartX + dx;
          this.panY = this.panStartY + dy;
          this.applyTransform();
        }
      }
    });

    const endPan = (e: PointerEvent): void => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.delete(e.pointerId);

      if (this.pointers.size === 1) {
        // Remaining finger continues panning smoothly from current pan
        const [rem] = Array.from(this.pointers.values());
        this.dragStartX = rem.x;
        this.dragStartY = rem.y;
        this.panStartX = this.panX;
        this.panStartY = this.panY;
      } else if (this.pointers.size === 0) {
        this.viewport.classList.remove('is-panning');
        if (this.didDrag) {
          setTimeout(() => {
            this.didDrag = false;
          }, 0);
        }
      }
    };
    window.addEventListener('pointerup', endPan);
    window.addEventListener('pointercancel', endPan);

    // Wheel zoom centered at pointer
    this.viewport.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const rect = this.viewport.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const factor = e.deltaY < 0 ? 1.1 : 0.91;
        this.zoomAt(this.scale * factor, cx, cy);
      },
      { passive: false },
    );

    // Delegated clicks inside Constellation Map
    this.nodesLayer.addEventListener('click', (e) => {
      if (this.didDrag) {
        e.preventDefault();
        return;
      }
      const target = e.target as HTMLElement;

      const expandBtn = target.closest<HTMLButtonElement>('[data-expand-sq]');
      if (expandBtn?.dataset.expandSq) {
        store.toggleSeqExpanded(expandBtn.dataset.expandSq);
        return;
      }

      const shotBtn = target.closest<HTMLButtonElement>('[data-shot-id]');
      if (shotBtn) {
        const sqId = shotBtn.dataset.sqId;
        const shotId = shotBtn.dataset.shotId;
        const doc = store.getDoc();
        const seq = doc?.sequences.find((s) => s.id === sqId);
        const shot = seq?.shots.find((sh) => sh.id === shotId);
        if (seq && shot) this.callbacks.onSelectShot(seq.id, shot);
        return;
      }

      const sqBtn = target.closest<HTMLButtonElement>('[data-sq-btn]');
      if (sqBtn?.dataset.sqBtn) {
        const seq = store.getDoc()?.sequences.find((s) => s.id === sqBtn.dataset.sqBtn);
        if (seq) this.callbacks.onSelectSequence(seq);
      }
    });

    // Quick SQ Jump Bar
    this.jumpStrip.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-jump-sq]');
      if (!btn?.dataset.jumpSq) return;
      this.focusSequence(btn.dataset.jumpSq);
    });

    // Delegated clicks inside Compact Tree View
    this.treeSection.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const shotBtn = target.closest<HTMLButtonElement>('[data-shot-id]');
      if (shotBtn) {
        const seq = store.getDoc()?.sequences.find((s) => s.id === shotBtn.dataset.sqId);
        const shot = seq?.shots.find((sh) => sh.id === shotBtn.dataset.shotId);
        if (seq && shot) this.callbacks.onSelectShot(seq.id, shot);
        return;
      }
      const sqBtn = target.closest<HTMLButtonElement>('[data-sq-btn]');
      if (sqBtn?.dataset.sqBtn) {
        const seq = store.getDoc()?.sequences.find((s) => s.id === sqBtn.dataset.sqBtn);
        if (seq) this.callbacks.onSelectSequence(seq);
      }
    });
  }

  private applyTransform(): void {
    const w = Math.round(this.worldWidth * this.scale);
    const h = Math.round(this.worldHeight * this.scale);
    this.world.style.setProperty('--z', this.scale.toFixed(4));
    this.world.style.width = `${w}px`;
    this.world.style.height = `${h}px`;
    this.world.style.transform = `translate(${Math.round(this.panX)}px, ${Math.round(this.panY)}px)`;
    this.svgLayer.setAttribute('width', String(w));
    this.svgLayer.setAttribute('height', String(h));
    this.zoomReadout.textContent = `${Math.round(this.scale * 100)}%`;
  }

  zoomAt(nextScale: number, anchorX?: number, anchorY?: number): void {
    const clamped = Math.min(1.75, Math.max(0.2, nextScale));
    const rect = this.viewport.getBoundingClientRect();
    const ax = anchorX ?? rect.width / 2;
    const ay = anchorY ?? rect.height / 2;

    const worldX = (ax - this.panX) / this.scale;
    const worldY = (ay - this.panY) / this.scale;

    this.scale = clamped;
    this.panX = ax - worldX * this.scale;
    this.panY = ay - worldY * this.scale;
    this.applyTransform();
  }

  zoomBy(multiplier: number): void {
    this.zoomAt(this.scale * multiplier);
  }

  fitView(): void {
    const rect = this.viewport.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 40) return;

    const padX = 48;
    const padY = 56;
    const scaleX = (rect.width - padX) / this.worldWidth;
    const scaleY = (rect.height - padY - 46) / this.worldHeight;
    const targetScale = Math.min(1.0, Math.max(0.2, Math.min(scaleX, scaleY)));

    this.scale = targetScale;
    this.panX = Math.max(12, (rect.width - this.worldWidth * this.scale) / 2);
    this.panY = Math.max(10, (rect.height - 46 - this.worldHeight * this.scale) / 2);
    this.applyTransform();
  }

  focusSequence(sqId: string): void {
    if (!store.isSeqExpanded(sqId)) {
      store.toggleSeqExpanded(sqId);
    }
    const coord = this.seqCoords.get(sqId);
    if (!coord) return;
    const rect = this.viewport.getBoundingClientRect();
    this.scale = Math.max(this.scale, 0.86);
    this.panX = rect.width / 2 - coord.x * this.scale;
    this.panY = rect.height / 2 - coord.y * this.scale - 16;
    this.applyTransform();
  }

  private matchesFilters(seq: SequenceDefinition, shot: ShotDefinition, status: ProgressStatus): boolean {
    const f = store.getFilterStatus();
    if (f !== 'all' && status !== f) return false;

    const q = store.getSearchQuery().toLowerCase();
    if (!q) return true;
    return (
      seq.id.toLowerCase().includes(q) ||
      seq.title.toLowerCase().includes(q) ||
      shot.code.toLowerCase().includes(q) ||
      shot.fullCode.toLowerCase().includes(q) ||
      shot.summary.toLowerCase().includes(q)
    );
  }

  private computeLayout(sequences: SequenceDefinition[]): {
    positioned: PositionedSeq[];
    coreX: number;
    coreY: number;
    width: number;
    height: number;
  } {
    const coreX = 135;
    const coreY = 490;
    const topSpineY = 420;
    const bottomSpineY = 560;

    let prevX = coreX + 120;
    let lastTopRight = coreX + 100;
    let lastBottomRight = coreX + 100;
    const positioned: PositionedSeq[] = [];
    this.seqCoords.clear();

    sequences.forEach((seq, idx) => {
      const isTop = idx % 2 === 0;
      const expanded = store.isSeqExpanded(seq.id);
      const cols = expanded ? (seq.shots.length > 5 ? Math.ceil(seq.shots.length / 2) : seq.shots.length) : 1;
      const fanWidth = expanded ? Math.max(190, cols * 120) : 184;
      const halfWidth = fanWidth / 2;

      const laneLastRight = isTop ? lastTopRight : lastBottomRight;
      const sqX = Math.round(Math.max(prevX + 185, laneLastRight + halfWidth + 30));
      const sqY = isTop ? topSpineY : bottomSpineY;

      if (isTop) lastTopRight = sqX + halfWidth;
      else lastBottomRight = sqX + halfWidth;
      prevX = sqX;

      const shotCoords: Array<{ shot: ShotDefinition; x: number; y: number }> = [];
      if (expanded) {
        const row1Count = seq.shots.length > 5 ? Math.ceil(seq.shots.length / 2) : seq.shots.length;
        const row2Count = seq.shots.length - row1Count;

        seq.shots.forEach((shot, sIdx) => {
          const isRow2 = sIdx >= row1Count;
          const colIdx = isRow2 ? sIdx - row1Count : sIdx;
          const rowTotal = isRow2 ? row2Count : row1Count;
          const xOffset = (colIdx - (rowTotal - 1) / 2) * 120;
          const baseLift = isRow2 ? 194 : 114;
          // Gentle constellation arc
          const arcLift = Math.round((1 - Math.abs(colIdx - (rowTotal - 1) / 2) * 0.14) * 14);
          const yOffset = isTop ? -(baseLift + arcLift) : baseLift + arcLift;

          shotCoords.push({
            shot,
            x: Math.round(sqX + xOffset),
            y: Math.round(sqY + yOffset),
          });
        });
      }

      this.seqCoords.set(seq.id, { x: sqX, y: sqY });
      positioned.push({ seq, x: sqX, y: sqY, isTop, expanded, shots: shotCoords });
    });

    const maxX = Math.max(lastTopRight, lastBottomRight) + 120;
    return { positioned, coreX, coreY, width: maxX, height: 940 };
  }

  render(): void {
    const doc = store.getDoc();
    if (!doc) return;
    const stageId = store.getActiveStageId();
    const stage = doc.stages.find((s) => s.id === stageId) ?? doc.stages[0];
    const viewMode = store.getViewMode();

    this.mapSection.hidden = viewMode !== 'map';
    this.treeSection.hidden = viewMode !== 'tree';

    if (viewMode === 'map') {
      this.renderMap(doc.sequences, stage.id, stage.shortName, stage.accentColor);
      if (!this.hasInitialFit) {
        this.hasInitialFit = true;
        requestAnimationFrame(() => this.fitView());
      }
    } else {
      this.renderTreeView(doc.sequences, stage.id);
    }
  }

  private renderMap(
    sequences: SequenceDefinition[],
    stageId: string,
    stageShortName: string,
    stageAccent: string,
  ): void {
    const layout = this.computeLayout(sequences);
    this.worldWidth = layout.width;
    this.worldHeight = layout.height;
    this.svgLayer.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);

    const stageStats = store.getStageStats(stageId);
    const svgPaths: string[] = [];
    const nodeHtml: string[] = [];
    const jumpHtml: string[] = [];

    // Stage Core Node
    nodeHtml.push(`
      <div class="stage-core-node" style="--nx:${layout.coreX}px; --ny:${layout.coreY}px; border-color:${escapeHtml(stageAccent)};">
        <div class="stage-core-kicker">Active Stage</div>
        <div class="stage-core-name">${escapeHtml(stageShortName)}</div>
        <div class="stage-core-stat">${stageStats.done}/${stageStats.total} Shots · ${stageStats.percent}%</div>
      </div>
    `);

    let prevAnchorX = layout.coreX + 86;
    let prevAnchorY = layout.coreY;

    layout.positioned.forEach((item) => {
      const sqStats = store.getSequenceStats(stageId, item.seq);
      const anyShotMatches = item.seq.shots.some((sh) =>
        this.matchesFilters(item.seq, sh, store.getShotEntry(stageId, sh.id).status),
      );
      const seqMatchesFilter =
        store.getFilterStatus() === 'all' && !store.getSearchQuery()
          ? true
          : anyShotMatches ||
            (store.getFilterStatus() === 'all' &&
              (item.seq.id.toLowerCase().includes(store.getSearchQuery().toLowerCase()) ||
                item.seq.title.toLowerCase().includes(store.getSearchQuery().toLowerCase())));

      // Spine Cubic Bezier from previous node
      const midX = (prevAnchorX + item.x) / 2;
      const spineClass =
        sqStats.derivedStatus === 'done'
          ? 'conduit-spine is-done'
          : sqStats.derivedStatus === 'in_progress' || sqStats.derivedStatus === 'review'
            ? 'conduit-spine is-active'
            : 'conduit-spine';
      svgPaths.push(
        `<path class="${spineClass}" d="M ${prevAnchorX} ${prevAnchorY} C ${midX} ${prevAnchorY}, ${midX} ${item.y}, ${item.x} ${item.y}" />`,
      );
      prevAnchorX = item.x;
      prevAnchorY = item.y;

      const glyph = STATUS_GLYPHS[sqStats.derivedStatus];
      nodeHtml.push(`
        <div class="sq-node-wrap ${seqMatchesFilter ? '' : 'is-dimmed'}" style="--nx:${item.x}px; --ny:${item.y}px;">
          <button
            type="button"
            class="sq-node status-${sqStats.derivedStatus}"
            data-sq-btn="${escapeHtml(item.seq.id)}"
            aria-label="${escapeHtml(item.seq.id)} ${escapeHtml(item.seq.title)}, ${STATUS_LABELS[sqStats.derivedStatus]}, ${sqStats.done} dari ${sqStats.total} shot selesai"
          >
            <div class="sq-code-row">
              <span class="status-glyph" aria-hidden="true">${glyph}</span>
              <span class="sq-code">${escapeHtml(item.seq.id)}</span>
            </div>
            <span class="sq-count">${sqStats.done}/${sqStats.total}</span>
            <div class="sq-title" title="${escapeHtml(item.seq.title)}">${escapeHtml(item.seq.title)}</div>
            <div class="sq-footer-row">
              <span>${item.seq.durationSec.toFixed(1)}s</span>
              <span>${sqStats.percent}%</span>
            </div>
          </button>
          <button
            type="button"
            class="sq-expand-btn"
            data-expand-sq="${escapeHtml(item.seq.id)}"
            aria-expanded="${item.expanded ? 'true' : 'false'}"
            aria-label="${item.expanded ? 'Tutup' : 'Buka'} cabang shot ${escapeHtml(item.seq.id)}"
            title="${item.expanded ? 'Tutup cabang shot' : 'Buka cabang shot'}"
          >${item.expanded ? '−' : '+'}</button>
        </div>
      `);

      // Shot Leaf Nodes & Energy Conduits
      item.shots.forEach(({ shot, x, y }) => {
        const entry = store.getShotEntry(stageId, shot.id);
        const matches = this.matchesFilters(item.seq, shot, entry.status);
        const startY = item.isTop ? item.y - 34 : item.y + 34;
        const endY = item.isTop ? y + 24 : y - 24;
        const cY = (startY + endY) / 2;

        svgPaths.push(
          `<path class="conduit-branch status-${entry.status} ${matches ? '' : 'is-dimmed'}" d="M ${item.x} ${startY} C ${item.x} ${cY}, ${x} ${cY}, ${x} ${endY}" />`,
        );

        const sGlyph = STATUS_GLYPHS[entry.status];
        nodeHtml.push(`
          <button
            type="button"
            class="shot-node status-${entry.status} ${matches ? '' : 'is-dimmed'}"
            style="--nx:${x}px; --ny:${y}px;"
            data-sq-id="${escapeHtml(item.seq.id)}"
            data-shot-id="${escapeHtml(shot.id)}"
            aria-label="${escapeHtml(shot.fullCode)}, status ${STATUS_LABELS[entry.status]}, durasi ${shot.durationSec.toFixed(1)} detik"
          >
            <div class="shot-top">
              <span class="shot-code">${escapeHtml(shot.code)}</span>
              <span class="status-glyph" aria-hidden="true">${sGlyph}</span>
            </div>
            <div class="shot-bottom">
              <span>${shot.durationSec.toFixed(1)}s</span>
              ${entry.version ? `<span class="version-pill">${escapeHtml(entry.version)}</span>` : `<span>#${shot.no}</span>`}
            </div>
          </button>
        `);
      });

      // Quick Jump pill
      jumpHtml.push(`
        <button type="button" class="sq-jump-btn status-${sqStats.derivedStatus}" data-jump-sq="${escapeHtml(item.seq.id)}">
          ${escapeHtml(item.seq.id)} · ${sqStats.done}/${sqStats.total}
        </button>
      `);
    });

    this.svgLayer.innerHTML = svgPaths.join('');
    this.nodesLayer.innerHTML = nodeHtml.join('');
    this.jumpStrip.innerHTML = jumpHtml.join('');
    this.applyTransform();
  }

  private renderTreeView(sequences: SequenceDefinition[], stageId: string): void {
    const cards: string[] = [];

    for (const seq of sequences) {
      const sqStats = store.getSequenceStats(stageId, seq);
      const visibleShots = seq.shots.filter((sh) =>
        this.matchesFilters(seq, sh, store.getShotEntry(stageId, sh.id).status),
      );
      if (visibleShots.length === 0 && (store.getFilterStatus() !== 'all' || store.getSearchQuery())) {
        continue;
      }

      const shotItems = (visibleShots.length > 0 ? visibleShots : seq.shots)
        .map((shot) => {
          const entry = store.getShotEntry(stageId, shot.id);
          return `
            <li>
              <button
                type="button"
                class="tree-shot-btn status-${entry.status}"
                data-sq-id="${escapeHtml(seq.id)}"
                data-shot-id="${escapeHtml(shot.id)}"
              >
                <span class="status-glyph" aria-hidden="true">${STATUS_GLYPHS[entry.status]}</span>
                <span>
                  <strong>${escapeHtml(shot.code)}</strong>
                  <span style="color:var(--text-secondary); font-size:0.76rem; margin-left:6px;">${escapeHtml(shot.timeRange)}</span>
                </span>
                <span class="version-pill">${escapeHtml(entry.version || STATUS_LABELS[entry.status])}</span>
              </button>
            </li>
          `;
        })
        .join('');

      cards.push(`
        <article class="tree-card" data-status="${sqStats.derivedStatus}">
          <header class="tree-card-header">
            <button type="button" class="tree-sq-btn" data-sq-btn="${escapeHtml(seq.id)}">
              <strong>${escapeHtml(seq.id)} — ${escapeHtml(seq.title)}</strong>
              <div style="font-size:0.74rem; color:var(--text-secondary); font-family:var(--font-mono);">
                ${escapeHtml(seq.timeRange)} · ${seq.durationSec.toFixed(1)}s
              </div>
            </button>
            <span class="stage-completion-pill">${STATUS_GLYPHS[sqStats.derivedStatus]} ${sqStats.done}/${sqStats.total}</span>
          </header>
          <ul class="tree-shots-list">${shotItems}</ul>
        </article>
      `);
    }

    this.treeSection.innerHTML =
      cards.length > 0
        ? cards.join('')
        : `<p style="color:var(--text-secondary); padding:20px;">Tidak ada SQ atau Shot yang cocok dengan filter saat ini.</p>`;
  }
}
