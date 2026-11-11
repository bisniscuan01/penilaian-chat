// assess.js — penilaian otomatis hasil lab PawonBoga.
// Input: URL repo GitHub peserta (+ URL live opsional). Output: skor per aspek dengan bukti.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ASPECTS, CHECKS, LIVE_CHECKS } from './checks.js';
import { renderHTML, printConsole } from './report.js';

const execFileP = promisify(execFile);
const UA = { 'User-Agent': 'penilaian-pawonboga', Accept: 'application/vnd.github+json' };
// Opsional: token GitHub untuk batch besar (tanpa token: ±60 req/jam ≈ 20 peserta)
const TOKEN = process.env.GITHUB_TOKEN;
if (TOKEN) UA.Authorization = `Bearer ${TOKEN}`;
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
    return { ok: r.ok, status: r.status, html, url: r.url };
  } catch (e) { return { ok: false, status: 0, html: '', url, note: e.message }; }
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

/* ---------- bangun konteks mode live-only (tanpa repo) ---------- */
async function buildLiveCtx(liveUrl) {
  const live = await fetchLive(liveUrl);
  let bundle = '', liveCss = '';
  if (live.ok && live.html) {
    const base = live.url || liveUrl;
    const jsSrcs = [...live.html.matchAll(/<script[^>]+src=["']([^"']+\.js)["']/g)].map((m) => m[1]);
    const cssHrefs = [...live.html.matchAll(/<link[^>]+href=["']([^"']+\.css)["']/g)].map((m) => m[1]);
    const fetchText = async (u, cap) => {
      try {
        const r = await fetch(new URL(u, base), { headers: UA });
        return r.ok ? (await r.text()).slice(0, cap) : '';
      } catch { return ''; }
    };
    bundle = (await Promise.all(jsSrcs.map((u) => fetchText(u, 4_000_000)))).join('\n');
    liveCss = (await Promise.all(cssHrefs.map((u) => fetchText(u, 1_000_000)))).join('\n');
  }
  return {
    mode: 'live', owner: null, repo: null, branch: null,
    fileList: [], files: new Map(), commitCount: null, commitMessages: [],
    live, bundle, liveCss, testRun: null,
  };
}

/* ---------- penilaian ---------- */
function assess(ctx, presentasi) {
  const isLive = ctx.mode === 'live';
  const results = (isLive ? LIVE_CHECKS : CHECKS).map((ch) => ({
    aspect: ch.aspect, points: ch.points, desc: ch.desc, pass: !!ch.run(ctx), needsRun: !!ch.needsRun,
  }));

  const aspects = ASPECTS.map((a) => {
    const rows = results.filter((r) => r.aspect === a.key);
    const flags = [];
    if (rows.length === 0) {
      flags.push(a.manual
        ? 'Dinilai manual oleh instruktur saat demo/presentasi.'
        : 'Tidak dapat diverifikasi dari situs live — minta repo GitHub atau nilai manual.');
      return { ...a, score: null, earned: 0, possible: 0, checks: [], flags, unverified: !a.manual };
    }
    const possible = rows.reduce((s, r) => s + r.points, 0);
    const earned = rows.reduce((s, r) => s + (r.pass ? r.points : 0), 0);
    if (a.semiManual) flags.push(a.semiManual);
    if (isLive && a.liveNote) flags.push(a.liveNote);
    if (!isLive && a.noteIfNoRun && !ctx.testRun?.passed) flags.push(a.noteIfNoRun);
    if (a.manual) flags.push('Dinilai manual oleh instruktur saat demo/presentasi.');
    const score = Math.round((earned / possible) * 1000) / 10;
    return { ...a, score, earned, possible, checks: rows, flags };
  });

  const verifiable = aspects.filter((a) => !a.manual && a.score !== null);
  const autoTotal = verifiable.reduce((s, a) => s + (a.weight * a.score) / 100, 0);
  const maxAuto = verifiable.reduce((s, a) => s + a.weight, 0);
  const final = typeof presentasi === 'number' ? autoTotal + (presentasi * 5) / 100 : null;

  return {
    mode: isLive ? 'live' : 'repo',
    aspects,
    autoTotal: Math.round(autoTotal * 10) / 10,
    maxAuto,
    presentasi: presentasi ?? null,
    final: final === null ? null : Math.round(final * 10) / 10,
    maxFinal: maxAuto + 5,
  };
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
  if (!peserta.repo && !peserta.live) throw new Error('Peserta tanpa repo maupun URL live');
  const ctx = peserta.repo
    ? await buildCtx(peserta.repo, peserta.live, opts.runTests, workbase)
    : await buildLiveCtx(peserta.live);
  const result = assess(ctx, peserta.presentasi);
  const ctxMeta = ctx.mode === 'live'
    ? { mode: 'live', liveStatus: ctx.live?.status ?? 0 }
    : { branch: ctx.branch, commitCount: ctx.commitCount, testRun: ctx.testRun ? { ran: ctx.testRun.ran, passed: ctx.testRun.passed, note: ctx.testRun.note || null, output: (ctx.testRun.output || '').slice(-800) } : null };
  return { ...peserta, repo: peserta.repo || null, live: peserta.live || null, ctxMeta, ...result };
}

async function main() {
  const opts = parseArgs(process.argv);
  let peserta = [];

  if (opts.batch) {
    const csv = await fs.readFile(opts.batch, 'utf8');
    peserta = csv.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => {
      const [nama, repo, live, pres] = l.split(',').map((s) => (s || '').trim());
      return { nama, repo: repo || null, live: live || null, presentasi: pres === '' || pres === undefined ? null : Number(pres) };
    });
    var pesertaList = peserta;
  } else if (opts.repo || opts.live) {
    pesertaList = [{ nama: opts.nama || (opts.repo ? parseRepo(opts.repo).repo : opts.live), repo: opts.repo || null, live: opts.live || null, presentasi: Number.isFinite(opts.presentasi) ? opts.presentasi : null }];
  } else {
    console.log(`Penggunaan:
  node assess.js --repo <url-github> [--live <url>] [--nama <nama>] [--presentasi 0-100]
  node assess.js --live <url-deploy>          # mode live-only (tanpa repo)
  node assess.js --batch peserta.csv
Opsi: --no-run-tests (lewati eksekusi npm test) · --out <folder> (default: hasil)

Format peserta.csv (satu peserta per baris):
  Nama,https://github.com/user/repo,https://url-live,80
  Nama,,https://url-live,80                    # kolom repo kosong = mode live-only`);
    process.exit(1);
  }

  await fs.mkdir(opts.out, { recursive: true });
  const all = [];
  for (const p of pesertaList) {
    process.stdout.write(`Menilai ${p.nama} (${p.repo || p.live}) ... `);
    try {
      const workbase = await fs.mkdtemp(path.join(os.tmpdir(), 'nilai-'));
      try {
        const r = await assessOne(p, opts, workbase);
        all.push(r);
        const ts = r.ctxMeta?.testRun;
        console.log(`selesai — total otomatis ${r.autoTotal}/${r.maxAuto}` + (ts ? (ts.ran ? (ts.passed ? ' · npm test LULUS' : ' · npm test GAGAL') : ` · test tidak dijalankan (${ts.note || '?'})`) : ''));
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
  const csvRows = ['nama,repo,mode,total_otomatis,maks_otomatis,presentasi,nilai_akhir,maks_akhir', ...all.map((r) => [r.nama, r.repo || '', r.mode || '', r.autoTotal, r.maxAuto ?? '', r.presentasi ?? '', r.final ?? '', r.maxFinal ?? ''].join(','))];
  await fs.writeFile(path.join(opts.out, 'ringkasan.csv'), csvRows.join('\n'));

  console.log(`\nLaporan: ${path.join(opts.out, 'laporan-penilaian.html')}`);
  console.log(`Data   : ${path.join(opts.out, `penilaian-${stamp}.json`)} dan ringkasan.csv`);
}

main().catch((e) => { console.error('Error:', e.message); process.exit(1); });
