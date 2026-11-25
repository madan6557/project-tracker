import { store } from '../state/store';
import { escapeHtml, wireModalDialog } from '../utils/dialogHelpers';

const GH_TOKEN_STORAGE_KEY = 'twinkle_tracker_gh_token_v1';
const DEFAULT_OWNER = 'madan6557';
const DEFAULT_REPO = 'project-tracker';
const DEFAULT_BRANCH = 'main';
const DEFAULT_FILE_PATH = 'public/data/progress.json';

export class DataSyncDialog {
  private dialog: HTMLDialogElement;
  private content: HTMLElement;
  private statusMsg = '';

  constructor(dialog: HTMLDialogElement, content: HTMLElement) {
    this.dialog = dialog;
    this.content = content;
    wireModalDialog(this.dialog);

    this.dialog.addEventListener('beforetoggle', () => {
      if (this.dialog.open) this.render();
    });
  }

  open(): void {
    this.statusMsg = '';
    this.render();
    if (!this.dialog.open) this.dialog.showModal();
  }

  render(): void {
    const hasDraft = store.getHasDraft();
    const savedToken = localStorage.getItem(GH_TOKEN_STORAGE_KEY) ?? '';

    this.content.innerHTML = `
      <header class="dialog-header">
        <div>
          <h1 class="dialog-title" id="sync-dialog-title">Sync &amp; Update Data (Statis)</h1>
          <p class="dialog-subtitle">Sumber data tunggal: public/data/progress.json · GitHub Pages Auto-Deploy</p>
        </div>
        <button type="button" class="btn" id="sync-close-btn" autofocus>Tutup</button>
      </header>

      ${this.statusMsg ? `<div class="feedback-banner" role="status">${escapeHtml(this.statusMsg)}</div>` : ''}

      <div class="sync-card">
        <h3>1. Edit Mode &amp; Export JSON (Offline-Friendly)</h3>
        <p>
          Semua perubahan di Edit Mode otomatis tersimpan sementara di browser (<code>localStorage</code>).
          Unduh <code>progress.json</code> lalu timpa file di <code>public/data/progress.json</code> sebelum push.
        </p>
        <div class="dialog-actions" style="justify-content:flex-start;">
          <button type="button" class="btn btn-primary" id="btn-download-json">⬇ Download progress.json</button>
          <button type="button" class="btn" id="btn-copy-json">⧉ Copy JSON</button>
          <label class="btn" style="cursor:pointer;">
            ⬆ Import JSON
            <input type="file" id="input-import-json" accept="application/json,.json" hidden />
          </label>
          ${hasDraft ? `<button type="button" class="btn btn-danger" id="btn-reset-draft">↺ Reset Draf Lokal</button>` : ''}
        </div>
      </div>

      <div class="sync-card">
        <h3>2. Auto-Sync dari Folder Blender Lokal</h3>
        <p>Jalankan perintah ini di terminal Windows untuk memindai Shot Plan &amp; versi <code>.blend</code> terbaru tanpa menghapus status manual:</p>
        <code class="code-block">python "d:\\MiKy LiRa\\Project\\Morneven Project\\Blender Project\\Twinkle\\07_Tools\\Scripts\\sync_twinkle_tracker.py"</code>
      </div>

      <div class="sync-card">
        <h3>3. Direct Publish ke GitHub (Opsional, Tanpa Server)</h3>
        <p>
          Ingin update langsung dari web/HP tanpa buka terminal? Masukkan Fine-Grained Personal Access Token GitHub
          (izin <em>Contents: Read &amp; Write</em> ke repo <code>${DEFAULT_OWNER}/${DEFAULT_REPO}</code>).
          Token hanya disimpan di browser perangkatmu sendiri (tidak pernah masuk ke kode repo).
        </p>
        <label class="form-field">
          <span>GitHub Fine-Grained PAT (opsional)</span>
          <input type="password" id="gh-pat-input" value="${escapeHtml(savedToken)}" placeholder="github_pat_..." autocomplete="off" />
        </label>
        <div class="dialog-actions" style="justify-content:flex-start;">
          <button type="button" class="btn btn-primary" id="btn-gh-publish">☁ Publish ke ${DEFAULT_OWNER}/${DEFAULT_REPO}</button>
          ${savedToken ? `<button type="button" class="btn" id="btn-gh-clear-token">Hapus Token Tersimpan</button>` : ''}
        </div>
      </div>
    `;

    this.content.querySelector('#sync-close-btn')?.addEventListener('click', () => this.dialog.close());

    this.content.querySelector('#btn-download-json')?.addEventListener('click', () => {
      const blob = new Blob([store.exportJsonString()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'progress.json';
      a.click();
      URL.revokeObjectURL(url);
      this.statusMsg = 'File progress.json berhasil diunduh.';
      this.render();
    });

    this.content.querySelector('#btn-copy-json')?.addEventListener('click', async () => {
      await navigator.clipboard.writeText(store.exportJsonString());
      this.statusMsg = 'JSON disalin ke clipboard.';
      this.render();
    });

    this.content.querySelector<HTMLInputElement>('#input-import-json')?.addEventListener('change', async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        store.importJsonString(text);
        this.statusMsg = `Berhasil mengimpor ${file.name} sebagai draf aktif.`;
      } catch (err) {
        this.statusMsg = err instanceof Error ? err.message : 'Gagal membaca JSON.';
      }
      this.render();
    });

    this.content.querySelector('#btn-reset-draft')?.addEventListener('click', () => {
      store.resetDraft();
      this.statusMsg = 'Draf lokal dihapus. Kembali menampilkan data terpublikasi.';
      this.render();
    });

    this.content.querySelector('#btn-gh-clear-token')?.addEventListener('click', () => {
      localStorage.removeItem(GH_TOKEN_STORAGE_KEY);
      this.statusMsg = 'Token GitHub dihapus dari browser ini.';
      this.render();
    });

    this.content.querySelector('#btn-gh-publish')?.addEventListener('click', async () => {
      const tokenInput = this.content.querySelector<HTMLInputElement>('#gh-pat-input');
      const token = tokenInput?.value.trim() ?? '';
      if (!token) {
        this.statusMsg = 'Masukkan GitHub Personal Access Token terlebih dahulu.';
        this.render();
        return;
      }

      localStorage.setItem(GH_TOKEN_STORAGE_KEY, token);
      this.statusMsg = 'Mengirim pembaruan ke GitHub...';
      this.render();

      try {
        const apiUrl = `https://api.github.com/repos/${DEFAULT_OWNER}/${DEFAULT_REPO}/contents/${DEFAULT_FILE_PATH}`;
        const jsonBytes = new TextEncoder().encode(store.exportJsonString());
        let binary = '';
        for (const byte of jsonBytes) binary += String.fromCharCode(byte);
        const contentBase64 = btoa(binary);

        const pushWithFreshSha = async (): Promise<Response> => {
          const metaResp = await fetch(`${apiUrl}?ref=${DEFAULT_BRANCH}&_t=${Date.now()}`, {
            cache: 'no-store',
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/vnd.github+json',
            },
          });
          if (!metaResp.ok) {
            throw new Error(`Gagal membaca SHA file di GitHub (HTTP ${metaResp.status}). Cek token & izin repo.`);
          }
          const metaJson = (await metaResp.json()) as { sha: string };

          return fetch(apiUrl, {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/vnd.github+json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              message: `chore: update TWINkle progress.json (${new Date().toISOString().slice(0, 16)}Z)`,
              content: contentBase64,
              sha: metaJson.sha,
              branch: DEFAULT_BRANCH,
            }),
          });
        };

        let putResp = await pushWithFreshSha();
        if (putResp.status === 409) {
          putResp = await pushWithFreshSha();
        }
        if (!putResp.ok) {
          throw new Error(`Gagal commit ke GitHub (HTTP ${putResp.status}).`);
        }

        this.statusMsg = 'Berhasil publish ke GitHub! GitHub Actions akan rebuild situs dalam ~30 detik.';
      } catch (err) {
        this.statusMsg = err instanceof Error ? err.message : 'Terjadi kesalahan saat publish ke GitHub.';
      }
      this.render();
    });
  }
}
