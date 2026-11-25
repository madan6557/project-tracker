# TWINkle Production Progression Tracker

Website statis bertema kosmik untuk memantau progres produksi film pendek animasi **TWINkle** (*Kilapan Kembar*, Powered by Morneven) di seluruh **8 tahap produksi**, **14 Sequence (`SQ01`–`SQ14`)**, dan **66 Shot (`1–10790` frame @ 60 fps)**.

## Fitur Utama

- **Macro Stage Spine (8 Stage):** `Blocking / Layout` → `Animation Polish` → `Lookdev` → `VFX / FX` → `Lighting` → `Rendering` → `Compositing` → `Editing & Delivery` *(tanpa tahap split per shot)*.
- **Interactive Game Progression Map:** Peta konstelasi 2D (*Star-Chart*) tempat setiap **SQ** menjadi node root dengan cabang **Shot** yang bisa di-expand/collapse, mendukung pan, zoom, Fit All, Quick SQ Jump, filter status, dan toggle ke **Compact Scene Tree**.
- **Inspector Detail & Cross-Stage View:** Klik node SQ atau Shot untuk melihat frame `6 fps` & `60 fps`, durasi, ringkasan storyboard, dan progres shot tersebut di seluruh 8 stage.
- **100% Statis & 3 Cara Update Data Praktis:**
  1. **Edit Mode + Export `progress.json`:** Aktifkan **Edit Mode** di header, ubah status shot (atau 1 SQ sekaligus), unduh `progress.json` untuk menimpa `public/data/progress.json`.
  2. **Script Auto-Sync Lokal:** Jalankan dari workspace Blender:
     ```powershell
     python "d:\MiKy LiRa\Project\Morneven Project\Blender Project\Twinkle\07_Tools\Scripts\sync_twinkle_tracker.py"
     ```
     Script membaca `TWINkle_Shot_Plan_v004.docx` dan memindai versi `.blend` terbaru di `04_Sequences/` tanpa menimpa status manual.
  3. **Direct Publish ke GitHub (Opsional, Tanpa Backend):** Buka menu **Sync Data → Publish to GitHub**, tempel Fine-Grained Personal Access Token GitHub milikmu (disimpan hanya di `localStorage` browser lokalmu), lalu klik **Publish ke GitHub**. GitHub Actions akan otomatis membangun ulang situs dalam ±30 detik.

---

## Pengembangan Lokal

```bash
npm install
npm run dev
```

Build produksi statis:

```bash
npm run build
npm run preview
```

---

## Cara Memasang Custom Domain `twinkle.morneven.com` (Squarespace DNS + GitHub Pages)

Website ini memakai path relatif (`base: './'`), sehingga langsung berfungsi di `https://madan6557.github.io/project-tracker/` maupun saat dipindah ke custom domain `https://twinkle.morneven.com/`.

### Langkah 1 — Tambahkan CNAME Record di Squarespace DNS
1. Buka **Squarespace → Domains → `morneven.com` → DNS Settings**.
2. Klik **Add Record** dan isi persis seperti berikut:
   - **Type:** `CNAME`
   - **Host:** `twinkle`
   - **Data / Points to:** `madan6557.github.io`
   - **TTL:** Default (`1 hr` / `3600`)
3. Simpan perubahan DNS.

### Langkah 2 — Aktifkan Custom Domain di GitHub Pages
1. Buka repository **GitHub → `madan6557/project-tracker` → Settings → Pages**.
2. Pada bagian **Custom domain**, ketik:
   ```text
   twinkle.morneven.com
   ```
   lalu klik **Save**.
3. Setelah verifikasi DNS selesai (±5–30 menit), centang **Enforce HTTPS**.
4. *(Opsional)* Setelah custom domain aktif, kamu juga boleh menambahkan file `public/CNAME` berisi `twinkle.morneven.com` agar setiap push menjaga konfigurasi domain.

*(Jika suatu saat ingin men-deploy ke **Vercel**, cukup impor repo yang sama; file `vercel.json` sudah siap dipakai.)*
