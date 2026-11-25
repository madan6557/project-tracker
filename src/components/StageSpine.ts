import { store } from '../state/store';
import { escapeHtml } from '../utils/dialogHelpers';

export class StageSpine {
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.container.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-stage-id]');
      if (!btn) return;
      const stageId = btn.dataset.stageId;
      if (stageId) store.setActiveStage(stageId);
    });

    this.container.addEventListener('keydown', (e) => {
      const buttons = Array.from(this.container.querySelectorAll<HTMLButtonElement>('[data-stage-id]'));
      const currentIdx = buttons.findIndex((b) => b === document.activeElement);
      if (currentIdx === -1) return;

      let nextIdx = currentIdx;
      if (e.key === 'ArrowRight') nextIdx = (currentIdx + 1) % buttons.length;
      else if (e.key === 'ArrowLeft') nextIdx = (currentIdx - 1 + buttons.length) % buttons.length;
      else return;

      e.preventDefault();
      buttons[nextIdx].focus();
      const stageId = buttons[nextIdx].dataset.stageId;
      if (stageId) store.setActiveStage(stageId);
    });
  }

  render(): void {
    const doc = store.getDoc();
    if (!doc) return;
    const activeStageId = store.getActiveStageId();
    const radius = 15;
    const circumference = 2 * Math.PI * radius;

    const parts: string[] = [];
    doc.stages.forEach((stage, idx) => {
      const stats = store.getStageStats(stage.id);
      const isActive = stage.id === activeStageId;
      const strokeOffset = circumference * (1 - stats.weightedPercent / 100);
      const stageNum = String(idx + 1).padStart(2, '0');

      parts.push(`
        <button
          type="button"
          role="tab"
          aria-selected="${isActive ? 'true' : 'false'}"
          tabindex="${isActive ? '0' : '-1'}"
          class="stage-node ${isActive ? 'is-active' : ''}"
          data-stage-id="${escapeHtml(stage.id)}"
          style="--stage-accent: ${escapeHtml(stage.accentColor)};"
        >
          <span class="stage-ring" aria-hidden="true">
            <svg viewBox="0 0 38 38">
              <circle class="stage-ring-bg" cx="19" cy="19" r="${radius}"></circle>
              <circle
                class="stage-ring-fg"
                cx="19"
                cy="19"
                r="${radius}"
                stroke-dasharray="${circumference.toFixed(1)}"
                stroke-dashoffset="${strokeOffset.toFixed(1)}"
              ></circle>
            </svg>
            <span class="stage-num">${stageNum}</span>
          </span>
          <span class="stage-name">${escapeHtml(stage.shortName)}</span>
          <span class="stage-meta">${stats.done}/${stats.total} · ${stats.percent}%</span>
        </button>
      `);

      if (idx < doc.stages.length - 1) {
        const isLit = stats.done > 0 || stats.review > 0 || stats.inProgress > 0;
        parts.push(`<div class="stage-connector ${isLit ? 'is-lit' : ''}" aria-hidden="true"></div>`);
      }
    });

    this.container.innerHTML = parts.join('');
  }
}
