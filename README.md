# Penilaian Otomatis — Lab PawonBoga

Tool CLI untuk menilai hasil lab peserta (repo GitHub + URL live) berdasarkan rubrik 7 aspek dari handbook PawonBoga.

## Prinsip

- **Semi-otomatis dan berbasis bukti.** Enam aspek dinilai otomatis dari artefak nyata (isi repo, test yang benar-benar dijalankan, respons URL live). Aspek **Presentasi & refleksi (5%)** tetap dinilai manual oleh instruktur.
- **UI/UX semi-otomatis**: pemeriksaan kode responsif memberi maks 85 poin; kontras, kerapian, dan uji mobile nyata tetap dinilai instruktur saat demo.
- Hasil adalah **bantuan penilaian**, bukan pengganti penilaian instruktur.

## Penggunaan

```powershell
cd "C:\CHAT\Web Dev\penilaian-pawonboga"

# Satu peserta
node assess.js --repo https://github.com/USER/pawonboga --live https://USER.github.io/pawonboga/ --nama "Budi" --presentasi 85

# Banyak peserta sekaligus (lihat peserta.example.csv)
node assess.js --batch peserta.csv

# Lebih cepat tanpa menjalankan test peserta
node assess.js --batch peserta.csv --no-run-tests
```

## Output (folder `hasil/`)

- `laporan-penilaian.html` — laporan visual: ringkasan kelas + detail check per peserta
- `ringkasan.csv` — rekap nilai
- `penilaian-<waktu>.json` — data mentah seluruh pemeriksaan

## Apa yang diperiksa

| Aspek (bobot) | Contoh pemeriksaan otomatis |
|---|---|
| Fitur katalog & dashboard (25%) | 8 produk, 4 kategori, `filterProducts`, `buildWhatsAppUrl`, `validateProduct`, localStorage `pawonboga:products:v1`, CRUD, import/export |
| Pengujian fungsi (15%) | File test ada, ≥10 unit test, **`npm test` benar-benar dijalankan dan lulus** |
| Pengujian keamanan (15%) | Escape HTML, innerHTML aman, tanpa pola secret, validasi JSON, batasan localStorage di README |
| Prompt & proses iteratif (10%) | SPEC.md, TASKS.md, UI-SPEC.md, ≥5 commit, pesan commit bervariasi |
| Deployment & dokumentasi (10%) | URL live 200, README lengkap, workflow deploy ada |
| UI/UX & responsivitas (20%) | Viewport, media query, grid responsif, reduced-motion, focus-visible *(semi-otomatis)* |
| Presentasi & refleksi (5%) | Manual oleh instruktur |

## Catatan keamanan

Mode default **menjalankan `npm test` pada kode peserta** setelah `npm ci --ignore-scripts`. Kode peserta adalah kode tidak tepercaya:

- Jalankan di mesin/VM khusus penilaian bila memungkinkan.
- `--ignore-scripts` memblokir lifecycle script npm, tetapi test tetap mengeksekusi kode peserta.
- Gunakan `--no-run-tests` bila tidak ingin mengeksekusi apa pun (aspek pengujian lalu ditandai "verifikasi manual").

## Keterbatasan

- Pemeriksaan mengasumsikan struktur proyek sesuai handbook (`src/products.js`, `src/store.js`, dst.). Struktur berbeda dapat menurunkan skor meski fitur ada — periksa manual bila ragu.
- API GitHub tanpa token dibatasi ±60 request/jam (cukup untuk ±25 peserta per run batch).
- Repo harus **public**; repo privat memerlukan token (belum didukung).
