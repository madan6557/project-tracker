import './styles/tokens.css';
import './styles/main.css';

import { DataSyncDialog } from './components/DataSyncDialog';
import { InspectorDialog } from './components/InspectorDialog';
import { ProgressionCanvas } from './components/ProgressionCanvas';
import { StageSpine } from './components/StageSpine';
import { store } from './state/store';
import type { ProgressStatus } from './types';
import { escapeHtml } from './utils/dialogHelpers';

function must<T extends HTMLElement | SVGSVGElement>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Missing required element: ${selector}`);
  return el;
}

async function bootstrap(): Promise<void> {
  const projectTitleEl = must<HTMLElement>('#project-title');
  const metaSpecsEl = must<HTMLElement>('#meta-specs');
  const overallPercentEl = must<HTMLElement>('#overall-percent');
  const overallMeterFillEl = must<HTMLElement>('#overall-meter-fill');
  const overallCountEl = must<HTMLElement>('#overall-count');
  const draftBadgeEl = must<HTMLElement>('#draft-badge');

  const btnVeyricToggle = must<HTMLButtonElement>('#btn-veyric-toggle');
  const btnEditMode = must<HTMLButtonElement>('#btn-edit-mode');
  const btnOpenSync = must<HTMLButtonElement>('#btn-open-sync');

  const activeStageIndexEl = must<HTMLElement>('#active-stage-index');
  const activeStageTitleEl = must<HTMLElement>('#active-stage-title');
  const activeStageStatsEl = must<HTMLElement>('#active-stage-stats');
  const activeStageDescEl = must<HTMLElement>('#active-stage-desc');

  const searchInput = must<HTMLInputElement>('#search-input');
  const filterButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-filter]'));
  const btnViewMap = must<HTMLButtonElement>('#btn-view-map');
  const btnViewTree = must<HTMLButtonElement>('#btn-view-tree');

  const btnExpandAll = must<HTMLButtonElement>('#btn-expand-all');
  const btnCollapseAll = must<HTMLButtonElement>('#btn-collapse-all');
  const btnZoomIn = must<HTMLButtonElement>('#btn-zoom-in');
  const btnZoomOut = must<HTMLButtonElement>('#btn-zoom-out');
  const btnFitView = must<HTMLButtonElement>('#btn-fit-view');

  const stageSpine = new StageSpine(must<HTMLElement>('#stage-spine'));
  const inspector = new InspectorDialog(
    must<HTMLDialogElement>('#inspector-dialog'),
    must<HTMLElement>('#inspector-content'),
  );
  const syncDialog = new DataSyncDialog(
    must<HTMLDialogElement>('#sync-dialog'),
    must<HTMLElement>('#sync-content'),
  );

  const canvas = new ProgressionCanvas(
    {
      mapSection: must<HTMLElement>('#star-map-section'),
      viewport: must<HTMLElement>('#map-viewport'),
      world: must<HTMLElement>('#map-world'),
      svgLayer: must<SVGSVGElement>('#map-conduits'),
      nodesLayer: must<HTMLElement>('#map-nodes'),
      treeSection: must<HTMLElement>('#tree-view-section'),
      jumpStrip: must<HTMLElement>('#sq-jump-strip'),
      zoomReadout: must<HTMLElement>('#zoom-readout'),
    },
    {
      onSelectShot: (sqId, shot) => inspector.openShot(sqId, shot),
      onSelectSequence: (seq) => inspector.openSequence(seq),
    },
  );

  const renderAll = (): void => {
    const doc = store.getDoc();
    if (!doc) return;

    metaSpecsEl.textContent = `${doc.meta.totalSequences} SQ · ${doc.meta.totalShots} Shot · ${doc.meta.totalFrames.toLocaleString('id-ID')}f @ ${doc.meta.fps} fps`;

    const overall = store.getOverallStats();
    overallPercentEl.textContent = `${overall.percent}%`;
    overallMeterFillEl.style.width = `${overall.percent}%`;
    overallCountEl.textContent = `${overall.completedUnits}/${overall.totalUnits} unit`;

    draftBadgeEl.hidden = !store.getHasDraft();

    const isVeyric = store.isVeyricTitle();
    projectTitleEl.classList.toggle('is-veyric', isVeyric);
    btnVeyricToggle.setAttribute('aria-pressed', String(isVeyric));

    const isEdit = store.isEditMode();
    btnEditMode.setAttribute('aria-pressed', String(isEdit));

    const viewMode = store.getViewMode();
    btnViewMap.classList.toggle('is-active', viewMode === 'map');
    btnViewMap.setAttribute('aria-pressed', String(viewMode === 'map'));
    btnViewTree.classList.toggle('is-active', viewMode === 'tree');
    btnViewTree.setAttribute('aria-pressed', String(viewMode === 'tree'));

    const stageIdx = Math.max(
      0,
      doc.stages.findIndex((s) => s.id === store.getActiveStageId()),
    );
    const activeStage = doc.stages[stageIdx];
    const stageStats = store.getStageStats(activeStage.id);
    activeStageIndexEl.textContent = `STAGE ${String(stageIdx + 1).padStart(2, '0')} / ${String(doc.stages.length).padStart(2, '0')}`;
    activeStageTitleEl.textContent = activeStage.name;
    activeStageStatsEl.textContent = `${stageStats.done} / ${stageStats.total} Shot (${stageStats.percent}%)`;
    activeStageDescEl.textContent = activeStage.description;

    const currentFilter = store.getFilterStatus();
    filterButtons.forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.filter === currentFilter);
    });

    stageSpine.render();
    canvas.render();
  };

  store.subscribe(renderAll);

  // Header & Toolbar Listeners
  btnVeyricToggle.addEventListener('click', () => store.toggleVeyricTitle());
  btnEditMode.addEventListener('click', () => store.toggleEditMode());
  btnOpenSync.addEventListener('click', () => syncDialog.open());

  btnViewMap.addEventListener('click', () => store.setViewMode('map'));
  btnViewTree.addEventListener('click', () => store.setViewMode('tree'));

  btnExpandAll.addEventListener('click', () => {
    store.expandAllSeqs();
    requestAnimationFrame(() => canvas.fitView());
  });
  btnCollapseAll.addEventListener('click', () => {
    store.collapseAllSeqs();
    requestAnimationFrame(() => canvas.fitView());
  });
  btnZoomIn.addEventListener('click', () => canvas.zoomBy(1.16));
  btnZoomOut.addEventListener('click', () => canvas.zoomBy(0.86));
  btnFitView.addEventListener('click', () => canvas.fitView());

  filterButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const f = (btn.dataset.filter ?? 'all') as 'all' | ProgressStatus;
      store.setFilterStatus(f);
    });
  });

  searchInput.addEventListener('input', () => {
    store.setSearchQuery(searchInput.value);
  });

  try {
    await store.init();
  } catch (err) {
    const main = must<HTMLElement>('#workspace-main');
    const msg = err instanceof Error ? err.message : String(err);
    main.innerHTML = `<div class="sync-card"><h3>Gagal Memuat Tracker</h3><p>${escapeHtml(msg)}</p></div>`;
  }
}

void bootstrap();
