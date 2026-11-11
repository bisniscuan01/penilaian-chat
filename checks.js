// checks.js — aspek rubrik dan pemeriksaan otomatis untuk hasil lab PawonBoga.
// Setiap check menghasilkan poin bila lulus. Poin per aspek dinormalisasi ke skala 0-100.

export const ASPECTS = [
  { key: 'fitur',      name: 'Fitur katalog & dashboard',   weight: 25 },
  { key: 'uji',        name: 'Pengujian fungsi',            weight: 15, noteIfNoRun: 'Test tidak dijalankan otomatis — jalankan tanpa --no-run-tests atau verifikasi manual.' },
  { key: 'aman',       name: 'Pengujian keamanan',          weight: 15 },
  { key: 'proses',     name: 'Prompt & proses iteratif',    weight: 10 },
  { key: 'deploy',     name: 'Deployment & dokumentasi',    weight: 10 },
  { key: 'uiux',       name: 'UI/UX & responsivitas',       weight: 20, semiManual: 'Pemeriksaan otomatis maks 85 poin (struktur responsif). Kontras, kerapian, dan uji mobile nyata dinilai instruktur saat demo.' },
  { key: 'presentasi', name: 'Presentasi & refleksi',       weight: 5,  manual: true },
];

const get = (ctx, p) => ctx.files.get(p) || '';
const allSrc = (ctx) => ctx.fileList.filter((f) => f.startsWith('src/')).map((f) => get(ctx, f)).join('\n');
const readme = (ctx) => { for (const [p, c] of ctx.files) if (/^readme\.md$/i.test(p)) return c; return ''; };
const hasFile = (ctx, re) => ctx.fileList.some((f) => re.test(f));
const testFiles = (ctx) => ctx.fileList.filter((f) => /\.test\.js$/.test(f));
const countIt = (ctx) => testFiles(ctx).reduce((n, f) => n + (get(ctx, f).match(/\bit\s*\(/g) || []).length, 0);

export const CHECKS = [
  /* ---- Fitur katalog & dashboard (25%) ---- */
  { aspect: 'fitur', points: 15, desc: 'Data minimal 8 produk contoh (src/products.js)',
    run: (c) => (get(c, 'src/products.js').match(/\bid\s*:/g) || []).length >= 8 },
  { aspect: 'fitur', points: 10, desc: 'Empat kategori: Makanan, Minuman, Camilan, Bumbu',
    run: (c) => ['Makanan', 'Minuman', 'Camilan', 'Bumbu'].every((k) => get(c, 'src/products.js').includes(k)) },
  { aspect: 'fitur', points: 15, desc: 'Fungsi murni filterProducts (cari + filter + sorting)',
    run: (c) => /filterProducts/.test(get(c, 'src/store.js')) },
  { aspect: 'fitur', points: 15, desc: 'Integrasi WhatsApp: buildWhatsAppUrl, wa.me, encodeURIComponent',
    run: (c) => /buildWhatsAppUrl/.test(allSrc(c)) && /wa\.me/.test(allSrc(c)) && /encodeURIComponent/.test(allSrc(c)) },
  { aspect: 'fitur', points: 10, desc: 'Validasi produk (validateProduct: harga/stok/kategori)',
    run: (c) => /validateProduct/.test(get(c, 'src/store.js')) },
  { aspect: 'fitur', points: 10, desc: 'Persistensi localStorage key pawonboga:products:v1',
    run: (c) => allSrc(c).includes('pawonboga:products:v1') },
  { aspect: 'fitur', points: 15, desc: 'Dashboard CRUD: tabel produk + aksi edit/hapus',
    run: (c) => /table/i.test(allSrc(c) + get(c, 'index.html')) && /data-action|Hapus/.test(allSrc(c)) },
  { aspect: 'fitur', points: 10, desc: 'Export/Import JSON (parseProductsJSON)',
    run: (c) => /parseProductsJSON/.test(get(c, 'src/store.js')) && /export/i.test(allSrc(c)) },

  /* ---- Pengujian fungsi (15%) ---- */
  { aspect: 'uji', points: 25, desc: 'Folder tests berisi file *.test.js',
    run: (c) => testFiles(c).length > 0 },
  { aspect: 'uji', points: 35, desc: 'Minimal 10 unit test (it(...))',
    run: (c) => countIt(c) >= 10 },
  { aspect: 'uji', points: 40, desc: 'npm test benar-benar lulus (dijalankan tool)',
    run: (c) => c.testRun?.passed === true, needsRun: true },

  /* ---- Pengujian keamanan (15%) ---- */
  { aspect: 'aman', points: 25, desc: 'Ada fungsi escape HTML (esc/escapeHtml)',
    run: (c) => /function esc|escapeHtml|const esc/.test(get(c, 'src/ui.js')) },
  { aspect: 'aman', points: 25, desc: 'innerHTML selalu melewati escape (atau tidak dipakai)',
    run: (c) => {
      const srcs = ctxFiles(c).filter(([p]) => p.startsWith('src/'));
      const withInner = srcs.filter(([, s]) => s.includes('innerHTML'));
      return withInner.every(([, s]) => s.includes('esc(') || /from\s+['"]\.\/ui\.js['"]/.test(s));
    } },
  { aspect: 'aman', points: 20, desc: 'Tidak ada pola secret/API key/password di repo',
    run: (c) => {
      const re = /(api[_-]?key|secret|password|token)\s*[:=]\s*['"][^'"]{8,}|sk-[a-zA-Z0-9]{20,}/i;
      return ![...ctxFiles(c)].some(([, s]) => re.test(s));
    } },
  { aspect: 'aman', points: 15, desc: 'Impor/localStorage tervalidasi: JSON.parse dalam try/catch + validateProduct',
    run: (c) => /JSON\.parse/.test(get(c, 'src/store.js')) && /try\s*{/.test(get(c, 'src/store.js')) && /validateProduct/.test(get(c, 'src/store.js')) },
  { aspect: 'aman', points: 15, desc: 'Batasan localStorage didokumentasikan di README',
    run: (c) => /localstorage/i.test(readme(c)) && /(batasan|prototipe|tanpa autentikasi|tidak (aman|untuk)|bukan sistem)/i.test(readme(c)) },

  /* ---- Prompt & proses iteratif (10%) ---- */
  { aspect: 'proses', points: 30, desc: 'SPEC.md ada di repo',
    run: (c) => hasFile(c, /^spec\.md$/i) },
  { aspect: 'proses', points: 20, desc: 'TASKS.md (rencana iterasi) ada',
    run: (c) => hasFile(c, /^tasks\.md$/i) },
  { aspect: 'proses', points: 10, desc: 'UI-SPEC.md ada',
    run: (c) => hasFile(c, /^ui-spec\.md$/i) },
  { aspect: 'proses', points: 25, desc: 'Minimal 5 commit (bukti proses iteratif)',
    run: (c) => c.commitCount !== null && c.commitCount >= 5 },
  { aspect: 'proses', points: 15, desc: 'Pesan commit bervariasi (>= 3 jenis prefix: feat/fix/chore/...)',
    run: (c) => {
      const prefixes = new Set((c.commitMessages || []).map((m) => (m.match(/^(\w+)[:(]/) || [])[1]).filter(Boolean));
      return prefixes.size >= 3;
    } },

  /* ---- Deployment & dokumentasi (10%) ---- */
  { aspect: 'deploy', points: 35, desc: 'URL live merespons HTTP 200',
    run: (c) => c.live?.ok === true },
  { aspect: 'deploy', points: 20, desc: 'README.md ada',
    run: (c) => hasFile(c, /^readme\.md$/i) },
  { aspect: 'deploy', points: 15, desc: 'README memuat cara menjalankan (npm install / npm run dev)',
    run: (c) => /npm\s+(install|run dev)/i.test(readme(c)) },
  { aspect: 'deploy', points: 15, desc: 'README memuat catatan batasan/limitasi',
    run: (c) => /(batasan|limitasi|prototipe|tanpa autentikasi|bukan.*produksi)/i.test(readme(c)) },
  { aspect: 'deploy', points: 15, desc: 'Workflow deploy tersedia (.github/workflows/*.yml)',
    run: (c) => hasFile(c, /^\.github\/workflows\/.+\.ya?ml$/) },

  /* ---- UI/UX & responsivitas (20%) — semi-otomatis, maks 85 poin ---- */
  { aspect: 'uiux', points: 20, desc: 'Meta viewport (mobile-ready)',
    run: (c) => /name=["']viewport["']/.test(get(c, 'index.html')) },
  { aspect: 'uiux', points: 20, desc: 'Minimal 2 media query responsif',
    run: (c) => (get(c, 'src/style.css').match(/@media/g) || []).length >= 2 },
  { aspect: 'uiux', points: 15, desc: 'Grid/flex responsif (auto-fill/minmax/flex-wrap)',
    run: (c) => /auto-fill|minmax|flex-wrap|grid-template/.test(get(c, 'src/style.css')) },
  { aspect: 'uiux', points: 10, desc: 'Menghormati prefers-reduced-motion',
    run: (c) => /prefers-reduced-motion/.test(get(c, 'src/style.css')) },
  { aspect: 'uiux', points: 10, desc: 'Fokus keyboard terlihat (:focus-visible)',
    run: (c) => /:focus-visible/.test(get(c, 'src/style.css')) },
  { aspect: 'uiux', points: 10, desc: 'Halaman live punya <title>',
    run: (c) => !!c.live?.html && /<title>[^<]+<\/title>/.test(c.live.html) },
];

function ctxFiles(ctx) {
  return ctx.fileList.filter((p) => ctx.files.has(p)).map((p) => [p, ctx.files.get(p)]);
}
