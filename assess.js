// assess.js — penilaian otomatis hasil lab PawonBoga.
// Input: URL repo GitHub peserta (+ URL live opsional). Output: skor per aspek dengan bukti.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ASPECTS, CHECKS } from './checks.js';
import { renderHTML, printConsole } from './report.js';

const execFileP = promisify(execFile);
const UA = { 'User-Agent': 'penilaian-pawonboga', Accept: 'application/vnd.github+json' };
// Jalankan npm lewat node langsung (.cmd dilarang tanpa shell di Node modern)
const NPM_CLI = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');

/* ---------- util ---------- */
function parseRepo(url) {
  const m = String(url || '').match(/github\.com\/([^/\s]+)\/([^/\s#?]+)/);
  if (!m) throw new Error(`URL repo tidak valid: ${url}`);
  return { owner: m[1], repo: m[2].replace(/\.git$/, '') };
}

async function gh(p) {
  try {
    const r = await fetch('https://api.github.com' + p, { headers: UA });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

async function fetchRaw(owner, repo, branch, p) {
  try {
    const r = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${p}`, { headers: UA });
    return r.ok ? await r.text() : null;
  } catch { return null; }
}

async function fetchLive(url) {
  if (!url) return { ok: false, status: 0, html: '', note: 'URL live tidak diberikan' };
  try {
    const r = await fetch(url, { headers: UA, redirect: 'follow' });
    const html = (await r.text()).slice(0, 200000);
    return { ok: r.ok, status: r.status, html };
  } catch (e) { return { ok: false, status: 0, html: '', note: e.message }; }
}

/* ---------- jalankan test peserta (opsional, default aktif) ---------- */
async function runTests(ctx, workbase) {
  const zip = path.join(workbase, 'repo.zip');
  const dir = path.join(workbase, 'repo');
  try {
    const r = await fetch(`https://codeload.github.com/${ctx.owner}/${ctx.repo}/zip/refs/heads/${ctx.branch}`, { headers: UA });
    if (!r.ok) return { ran: false, passed: false, note: 'gagal mengunduh arsip repo' };
    await fs.writeFile(zip, Buffer.from(await r.arrayBuffer()));
    await fs.mkdir(dir, { recursive: true });
    await execFileP('tar', ['-xf', zip, '-C', dir], { timeout: 60000 });
    const [inner] = await fs.readdir(dir);
    const proj = path.join(dir, inner);

    const npmOpts = { cwd: proj, timeout: 300000, env: { ...process.env, CI: 'true' } };
    try {
      await execFileP(process.execPath, [NPM_CLI, 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], npmOpts);
    } catch {
      await execFileP(process.execPath, [NPM_CLI, 'install', '--ignore-scripts', '--no-audit', '--no-fund'], npmOpts);
    }
    try {
      const { stdout, stderr } = await execFileP(process.execPath, [NPM_CLI, 'test'], npmOpts);
      return { ran: true, passed: true, output: (stdout + stderr).slice(-3000) };
    } catch (e) {
      return { ran: true, passed: false, output: String(e.stdout || '') + String(e.stderr || e.message).slice(-3000) };
    }
  } catch (e) {
    return { ran: false, passed: false, note: 'gagal menjalankan test: ' + e.message };
  }
}

/* ---------- bangun konteks repo ---------- */
async function buildCtx(repoUrl, liveUrl, wantRunTests, workbase) {
  const { owner, repo } = parseRepo(repoUrl);
  const info = await gh(`/repos/${owner}/${repo}`);
  if (!info) throw new Error(`Repo tidak ditemukan atau privat: ${repoUrl}`);
  const branch = info.default_branch || 'main';

  const tree = await gh(`/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`);
  const fileList = tree?.tree?.filter((t) => t.type === 'blob').map((t) => t.path) || [];

  const commits = await gh(`/repos/${owner}/${repo}/commits?per_page=100`);
  const commitCount = Array.isArray(commits) ? commits.length : null;
  const commitMessages = Array.isArray(commits) ? commits.map((c) => c.commit?.message || '') : [];

  const wanted = new Set([
    'index.html', 'package.json', 'README.md', 'SPEC.md', 'UI-SPEC.md', 'TASKS.md',
    'src/products.js', 'src/store.js', 'src/ui.js', 'src/main.js', 'src/style.css',
    ...fileList.filter((f) => /\.test\.js$/.test(f)),
  ]);
  const entries = await Promise.all([...wanted].map(async (p) => [p, await fetchRaw(owner, repo, branch, p)]));
  const files = new Map(entries.filter(([, c]) => c !== null));

  const live = await fetchLive(liveUrl);

  const ctx = { owner, repo, branch, fileList, files, commitCount, commitMessages, live, testRun: null };
  if (wantRunTests) ctx.testRun = await runTests(ctx, workbase);
  return ctx;
}

/* ---------- penilaian ---------- */
function assess(ctx, presentasi) {
  const results = CHECKS.map((ch) => ({
    aspect: ch.aspect, points: ch.points, desc: ch.desc, pass: !!ch.run(ctx), needsRun: !!ch.needsRun,
  }));

  const aspects = ASPECTS.map((a) => {
    const rows = results.filter((r) => r.aspect === a.key);
    const possible = rows.reduce((s, r) => s + r.points, 0);
    const earned = rows.reduce((s, r) => s + (r.pass ? r.points : 0), 0);
    const flags = [];
    if (a.semiManual) flags.push(a.semiManual);
    if (a.noteIfNoRun && !ctx.testRun?.passed) flags.push(a.noteIfNoRun);
    if (a.manual) flags.push('Dinilai manual oleh instruktur saat demo/presentasi.');
    const score = possible ? Math.round((earned / possible) * 1000) / 10 : null;
    return { ...a, score, earned, possible, checks: rows, flags };
  });

  const autoTotal = aspects
    .filter((a) => !a.manual)
    .reduce((s, a) => s + (a.weight * (a.score ?? 0)) / 100, 0);
  const final = typeof presentasi === 'number' ? autoTotal + (presentasi * 5) / 100 : null;

  return { aspects, autoTotal: Math.round(autoTotal * 10) / 10, presentasi: presentasi ?? null, final: final === null ? null : Math.round(final * 10) / 10 };
}

/* ---------- CLI ---------- */
function parseArgs(argv) {
  const o = { runTests: true, out: 'hasil' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--no-run-tests') o.runTests = false;
    else if (a === '--repo') o.repo = argv[++i];
    else if (a === '--live') o.live = argv[++i];
    else if (a === '--nama') o.nama = argv[++i];
    else if (a === '--presentasi') o.presentasi = Number(argv[++i]);
    else if (a === '--batch') o.batch = argv[++i];
    else if (a === '--out') o.out = argv[++i];
  }
  return o;
}

async function assessOne(peserta, opts, workbase) {
  const ctx = await buildCtx(peserta.repo, peserta.live, opts.runTests, workbase);
  const result = assess(ctx, peserta.presentasi);
  return { ...peserta, repo: peserta.repo, live: peserta.live || null, ctxMeta: { branch: ctx.branch, commitCount: ctx.commitCount, testRun: ctx.testRun ? { ran: ctx.testRun.ran, passed: ctx.testRun.passed, note: ctx.testRun.note || null, output: (ctx.testRun.output || '').slice(-800) } : null }, ...result };
}

async function main() {
  const opts = parseArgs(process.argv);
  let peserta = [];

  if (opts.batch) {
    const csv = await fs.readFile(opts.batch, 'utf8');
    peserta = csv.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => {
      const [nama, repo, live, pres] = l.split(',').map((s) => (s || '').trim());
      return { nama, repo, live: live || null, presentasi: pres === '' || pres === undefined ? null : Number(pres) };
    });
    var pesertaList = peserta;
  } else if (opts.repo) {
    pesertaList = [{ nama: opts.nama || parseRepo(opts.repo).repo, repo: opts.repo, live: opts.live || null, presentasi: Number.isFinite(opts.presentasi) ? opts.presentasi : null }];
  } else {
    console.log(`Penggunaan:
  node assess.js --repo <url-github> [--live <url>] [--nama <nama>] [--presentasi 0-100]
  node assess.js --batch peserta.csv
Opsi: --no-run-tests (lewati eksekusi npm test) · --out <folder> (default: hasil)

Format peserta.csv (satu peserta per baris):
  Nama,https://github.com/user/repo,https://url-live,80`);
    process.exit(1);
  }

  await fs.mkdir(opts.out, { recursive: true });
  const all = [];
  for (const p of pesertaList) {
    process.stdout.write(`Menilai ${p.nama} (${p.repo}) ... `);
    try {
      const workbase = await fs.mkdtemp(path.join(os.tmpdir(), 'nilai-'));
      try {
        const r = await assessOne(p, opts, workbase);
        all.push(r);
        const ts = r.ctxMeta?.testRun;
        console.log(`selesai — total otomatis ${r.autoTotal}/95` + (ts ? (ts.ran ? (ts.passed ? ' · npm test LULUS' : ' · npm test GAGAL') : ` · test tidak dijalankan (${ts.note || '?'})`) : ''));
      } finally {
        await fs.rm(workbase, { recursive: true, force: true }).catch(() => {});
      }
    } catch (e) {
      console.log('GAGAL: ' + e.message);
      all.push({ ...p, error: e.message, aspects: [], autoTotal: 0, final: null });
    }
  }

  for (const r of all) printConsole(r);

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  await fs.writeFile(path.join(opts.out, `penilaian-${stamp}.json`), JSON.stringify(all, null, 2));
  await fs.writeFile(path.join(opts.out, 'laporan-penilaian.html'), renderHTML(all));
  const csvRows = ['nama,repo,total_otomatis_95,presentasi,nilai_akhir_100', ...all.map((r) => [r.nama, r.repo, r.autoTotal, r.presentasi ?? '', r.final ?? ''].join(','))];
  await fs.writeFile(path.join(opts.out, 'ringkasan.csv'), csvRows.join('\n'));

  console.log(`\nLaporan: ${path.join(opts.out, 'laporan-penilaian.html')}`);
  console.log(`Data   : ${path.join(opts.out, `penilaian-${stamp}.json`)} dan ringkasan.csv`);
}

main().catch((e) => { console.error('Error:', e.message); process.exit(1); });
