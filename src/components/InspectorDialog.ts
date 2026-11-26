import { STATUS_GLYPHS, STATUS_LABELS, STATUS_ORDER, store } from '../state/store';
import type { ProgressStatus, SequenceDefinition, ShotDefinition } from '../types';
import { escapeHtml, wireModalDialog } from '../utils/dialogHelpers';

export class InspectorDialog {
  private dialog: HTMLDialogElement;
  private content: HTMLElement;
  private showAnimaticRef = false;

  constructor(dialog: HTMLDialogElement, content: HTMLElement) {
    this.dialog = dialog;
    this.content = content;
    wireModalDialog(this.dialog);
  }

  openShot(sqId: string, shot: ShotDefinition): void {
    this.showAnimaticRef = false;
    this.renderShotModal(sqId, shot);
    if (!this.dialog.open) this.dialog.showModal();
  }

  openSequence(seq: SequenceDefinition): void {
    this.renderSequenceModal(seq);
    if (!this.dialog.open) this.dialog.showModal();
  }

  private renderShotModal(sqId: string, shot: ShotDefinition): void {
    const doc = store.getDoc();
    if (!doc) return;
    const stageId = store.getActiveStageId();
    const activeStage = doc.stages.find((s) => s.id === stageId) ?? doc.stages[0];
    const seq = doc.sequences.find((s) => s.id === sqId);
    const entry = store.getShotEntry(stageId, shot.id);
    const adminUnlocked = store.isAdminUnlocked();
    const editMode = adminUnlocked && store.isEditMode();
    const resolvedThumb = store.resolveShotThumbnail(stageId, shot);
    const canCompareRef = Boolean(resolvedThumb?.refUrl && resolvedThumb.refUrl !== resolvedThumb.url);
    const displayedUrl =
      this.showAnimaticRef && resolvedThumb?.refUrl ? resolvedThumb.refUrl : resolvedThumb?.url ?? '';
    const displayedBadge =
      this.showAnimaticRef && canCompareRef ? 'Ref: Animatic' : resolvedThumb?.badge ?? '';

    const thumbHtml = resolvedThumb
      ? `<figure class="inspector-thumb-wrap">
           <img
             src="${escapeHtml(displayedUrl)}"
             alt="Preview ${escapeHtml(shot.fullCode)} (${escapeHtml(displayedBadge)})"
             loading="lazy"
             decoding="async"
             class="inspector-thumb-img"
           />
           <span class="thumb-badge ${!this.showAnimaticRef && resolvedThumb.isFallback ? 'is-fallback' : ''}">${escapeHtml(displayedBadge)}</span>
           ${
             canCompareRef
               ? `<button type="button" class="btn thumb-compare-btn" id="btn-toggle-ref-thumb">${this.showAnimaticRef ? 'Lihat Preview Stage' : 'Lihat Ref Animatic'}</button>`
               : ''
           }
         </figure>`
      : '';

    const crossStageHtml = doc.stages
      .map((st) => {
        const stEntry = store.getShotEntry(st.id, shot.id);
        return `
          <button
            type="button"
            class="cross-stage-pill status-${stEntry.status} ${st.id === stageId ? 'is-current' : ''}"
            data-jump-stage="${escapeHtml(st.id)}"
          >
            <span>${escapeHtml(st.shortName)}</span>
            <span class="status-glyph" title="${escapeHtml(STATUS_LABELS[stEntry.status])}">${STATUS_GLYPHS[stEntry.status]}</span>
          </button>
        `;
      })
      .join('');

    const statusBtns = STATUS_ORDER.map(
      (st) => `
        <button
          type="button"
          class="status-pick-btn status-${st} ${entry.status === st ? 'is-selected' : ''}"
          data-pick-status="${st}"
        >
          <span class="status-glyph" aria-hidden="true">${STATUS_GLYPHS[st]}</span> ${escapeHtml(STATUS_LABELS[st])}
        </button>
      `,
    ).join('');

    this.content.innerHTML = `
      <header class="dialog-header">
        <div>
          <h1 class="dialog-title" id="inspector-title">${escapeHtml(shot.fullCode)} · ${escapeHtml(seq?.title ?? '')}</h1>
          <p class="dialog-subtitle">Shot #${String(shot.no).padStart(2, '0')} · Stage: ${escapeHtml(activeStage.name)}</p>
        </div>
        <button type="button" class="btn" id="inspector-close-top" autofocus>Tutup</button>
      </header>

      ${thumbHtml}

      <div class="spec-grid">
        <div class="spec-box">
          <span class="spec-label">Status (${escapeHtml(activeStage.shortName)})</span>
          <span class="spec-value status-${entry.status}">${STATUS_GLYPHS[entry.status]} ${escapeHtml(STATUS_LABELS[entry.status])}</span>
        </div>
        <div class="spec-box">
          <span class="spec-label">6 fps Animatic</span>
          <span class="spec-value">${escapeHtml(shot.frames6fps)}</span>
        </div>
        <div class="spec-box">
          <span class="spec-label">60 fps Blender</span>
          <span class="spec-value">${escapeHtml(shot.frames60fps)}</span>
        </div>
        <div class="spec-box">
          <span class="spec-label">Timestamp &amp; Durasi</span>
          <span class="spec-value">${escapeHtml(shot.timeRange)} (${shot.durationSec.toFixed(1)}s)</span>
        </div>
      </div>

      ${
        shot.summary
          ? `<div class="sync-card">
               <h3>Ringkasan Storyboard</h3>
               <p>${escapeHtml(shot.summary)}</p>
             </div>`
          : ''
      }

      <div>
        <div style="font-size:0.8rem; font-weight:600; margin-bottom:6px; color:var(--text-secondary);">
          Progres Shot di Seluruh 8 Stage (klik untuk pindah stage)
        </div>
        <div class="cross-stage-grid">${crossStageHtml}</div>
      </div>

      ${
        editMode
          ? `<div class="editor-panel">
               <div style="font-size:0.84rem; font-weight:600; color:var(--sola-topaz);">Edit Progres (${escapeHtml(activeStage.shortName)})</div>
               <div class="status-picker">${statusBtns}</div>
               <label class="form-field">
                 <span>Versi File / Milestone (mis. v006, Light_v017)</span>
                 <input type="text" id="shot-version-input" value="${escapeHtml(entry.version ?? '')}" placeholder="v001" />
               </label>
               <label class="form-field">
                 <span>Catatan</span>
                 <textarea id="shot-note-input" rows="2" placeholder="Catatan blok, kamera, atau review...">${escapeHtml(entry.note ?? '')}</textarea>
               </label>
               <label class="form-field">
                 <span>Thumbnail Stage (opsional, URL atau ./thumbnails/...)</span>
                 <input type="text" id="shot-thumb-input" value="${escapeHtml(entry.thumbnail ?? '')}" placeholder="./thumbnails/lookdev/${escapeHtml(shot.id)}.webp" />
               </label>
               <div class="dialog-actions">
                 <button type="button" class="btn btn-primary" id="save-shot-edit">Simpan Perubahan</button>
               </div>
             </div>`
          : `<div class="sync-card">
               <p><strong>Versi:</strong> ${escapeHtml(entry.version || '—')} · <strong>Catatan:</strong> ${escapeHtml(entry.note || 'Belum ada catatan.')}</p>
               ${adminUnlocked ? `<div><button type="button" class="btn btn-toggle" id="enable-edit-from-modal">✎ Aktifkan Edit Mode untuk Ubah Status</button></div>` : ''}
             </div>`
      }
    `;

    this.content.querySelector('#inspector-close-top')?.addEventListener('click', () => this.dialog.close());

    this.content.querySelector('#btn-toggle-ref-thumb')?.addEventListener('click', () => {
      this.showAnimaticRef = !this.showAnimaticRef;
      this.renderShotModal(sqId, shot);
    });

    this.content.querySelectorAll<HTMLButtonElement>('[data-jump-stage]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.jumpStage) {
          this.showAnimaticRef = false;
          store.setActiveStage(btn.dataset.jumpStage);
          this.renderShotModal(sqId, shot);
        }
      });
    });

    this.content.querySelector('#enable-edit-from-modal')?.addEventListener('click', () => {
      if (!store.isEditMode()) store.toggleEditMode();
      this.renderShotModal(sqId, shot);
    });

    if (editMode) {
      let pendingStatus: ProgressStatus = entry.status;
      const pickBtns = this.content.querySelectorAll<HTMLButtonElement>('[data-pick-status]');
      pickBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
          pendingStatus = btn.dataset.pickStatus as ProgressStatus;
          pickBtns.forEach((b) => b.classList.toggle('is-selected', b === btn));
        });
      });

      this.content.querySelector('#save-shot-edit')?.addEventListener('click', () => {
        const version = (this.content.querySelector('#shot-version-input') as HTMLInputElement).value.trim();
        const note = (this.content.querySelector('#shot-note-input') as HTMLTextAreaElement).value.trim();
        const thumbnail = (this.content.querySelector('#shot-thumb-input') as HTMLInputElement).value.trim();
        store.updateShotEntry(stageId, shot.id, { status: pendingStatus, version, note, thumbnail });
        this.renderShotModal(sqId, shot);
      });
    }
  }

  private renderSequenceModal(seq: SequenceDefinition): void {
    const doc = store.getDoc();
    if (!doc) return;
    const stageId = store.getActiveStageId();
    const activeStage = doc.stages.find((s) => s.id === stageId) ?? doc.stages[0];
    const sqStats = store.getSequenceStats(stageId, seq);
    const adminUnlocked = store.isAdminUnlocked();
    const editMode = adminUnlocked && store.isEditMode();

    const shotThumbs = seq.shots
      .map((sh) => {
        const res = store.resolveShotThumbnail(stageId, sh);
        if (!res) return '';
        return `
          <button type="button" class="sq-thumb-card" data-open-shot="${escapeHtml(sh.id)}">
            <img src="${escapeHtml(res.url)}" alt="${escapeHtml(sh.code)}" loading="lazy" decoding="async" />
            <span>${escapeHtml(sh.code)}</span>
          </button>
        `;
      })
      .join('');

    const shotRows = seq.shots
      .map((sh) => {
        const entry = store.getShotEntry(stageId, sh.id);
        return `
          <li>
            <button type="button" class="tree-shot-btn status-${entry.status}" data-open-shot="${escapeHtml(sh.id)}">
              <span class="status-glyph" aria-hidden="true">${STATUS_GLYPHS[entry.status]}</span>
              <span><strong>${escapeHtml(sh.code)}</strong> · ${escapeHtml(sh.frames60fps)} (${sh.durationSec.toFixed(1)}s)</span>
              <span class="version-pill">${escapeHtml(entry.version || STATUS_LABELS[entry.status])}</span>
            </button>
          </li>
        `;
      })
      .join('');

    const bulkBtns = STATUS_ORDER.map(
      (st) => `
        <button type="button" class="status-pick-btn status-${st}" data-bulk-status="${st}">
          <span class="status-glyph" aria-hidden="true">${STATUS_GLYPHS[st]}</span> Set Semua → ${escapeHtml(STATUS_LABELS[st])}
        </button>
      `,
    ).join('');

    this.content.innerHTML = `
      <header class="dialog-header">
        <div>
          <h1 class="dialog-title" id="inspector-title">${escapeHtml(seq.id)} — ${escapeHtml(seq.title)}</h1>
          <p class="dialog-subtitle">${escapeHtml(seq.folderName)} · Stage: ${escapeHtml(activeStage.name)}</p>
        </div>
        <button type="button" class="btn" id="inspector-close-top" autofocus>Tutup</button>
      </header>

      <div class="spec-grid">
        <div class="spec-box">
          <span class="spec-label">Progres ${escapeHtml(activeStage.shortName)}</span>
          <span class="spec-value">${sqStats.done}/${sqStats.total} Shot (${sqStats.percent}%)</span>
        </div>
        <div class="spec-box">
          <span class="spec-label">Rentang Waktu</span>
          <span class="spec-value">${escapeHtml(seq.timeRange)}</span>
        </div>
        <div class="spec-box">
          <span class="spec-label">Total Frame (60 fps)</span>
          <span class="spec-value">${seq.totalFrames}f (${seq.durationSec.toFixed(1)}s)</span>
        </div>
      </div>

      ${
        shotThumbs
          ? `<div class="sq-thumb-strip scroller" aria-label="Thumbnail Shot ${escapeHtml(seq.id)}">${shotThumbs}</div>`
          : ''
      }

      ${
        editMode
          ? `<div class="editor-panel">
               <div style="font-size:0.84rem; font-weight:600; color:var(--sola-topaz);">
                 Bulk Update Seluruh ${seq.shots.length} Shot di ${escapeHtml(seq.id)} (${escapeHtml(activeStage.shortName)})
               </div>
               <div class="status-picker" style="grid-template-columns:repeat(2,minmax(0,1fr));">${bulkBtns}</div>
             </div>`
          : adminUnlocked
            ? `<div class="sync-card">
                 <p>Aktifkan <strong>Edit Mode</strong> untuk mengubah status seluruh shot di ${escapeHtml(seq.id)} sekaligus atau klik masing-masing shot di bawah.</p>
                 <div><button type="button" class="btn btn-toggle" id="enable-edit-sq">✎ Aktifkan Edit Mode</button></div>
               </div>`
            : ''
      }

      <div>
        <div style="font-size:0.8rem; font-weight:600; margin-bottom:6px; color:var(--text-secondary);">
          Daftar Shot di ${escapeHtml(seq.id)} (klik untuk detail)
        </div>
        <ul class="tree-shots-list" style="padding:0;">${shotRows}</ul>
      </div>
    `;

    this.content.querySelector('#inspector-close-top')?.addEventListener('click', () => this.dialog.close());
    this.content.querySelector('#enable-edit-sq')?.addEventListener('click', () => {
      if (!store.isEditMode()) store.toggleEditMode();
      this.renderSequenceModal(seq);
    });

    this.content.querySelectorAll<HTMLButtonElement>('[data-bulk-status]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const status = btn.dataset.bulkStatus as ProgressStatus;
        store.updateSequenceStatus(stageId, seq, status);
        this.renderSequenceModal(seq);
      });
    });

    this.content.querySelectorAll<HTMLButtonElement>('[data-open-shot]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const shot = seq.shots.find((s) => s.id === btn.dataset.openShot);
        if (shot) this.renderShotModal(seq.id, shot);
      });
    });
  }
}
