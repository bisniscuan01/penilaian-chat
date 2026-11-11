// report.js — output konsol dan laporan HTML untuk penilaian PawonBoga.

export function grade(n) {
  return n >= 85 ? 'Sangat Baik' : n >= 70 ? 'Baik' : n >= 60 ? 'Cukup' : 'Perlu Perbaikan';
}

export function printConsole(r) {
  console.log('\n========================================');
  console.log(`Peserta : ${r.nama}`);
  if (r.error) { console.log(`GAGAL   : ${r.error}`); return; }
  console.log(`Repo    : ${r.repo || '(tidak ada — mode live-only)'}`);
  console.log(`Live    : ${r.live || '(tidak diberikan)'}`);
  if (r.mode === 'live') console.log(`Mode    : LIVE-ONLY — hanya ${r.maxAuto} dari 95 poin rubrik yang dapat diverifikasi otomatis`);
  for (const a of r.aspects) {
    if (a.manual) {
      console.log(`  ${a.name} (${a.weight}%) : MANUAL${r.presentasi !== null ? ' = ' + r.presentasi : ''}`);
      continue;
    }
    if (a.score === null) {
      console.log(`  ${a.name.padEnd(30)} (${a.weight}%) : TIDAK TERVERIFIKASI`);
      continue;
    }
    const tag = a.flags.length ? '  [review instruktur]' : '';
    console.log(`  ${a.name.padEnd(30)} (${a.weight}%) : ${String(a.score).padStart(5)}/100${tag}`);
    for (const c of a.checks.filter((x) => !x.pass)) {
      console.log(`      [--] ${c.desc}`);
    }
  }
  console.log(`  TOTAL OTOMATIS (terverifikasi): ${r.autoTotal}/${r.maxAuto}`);
  if (r.final !== null) console.log(`  NILAI AKHIR (+presentasi)  : ${r.final}/${r.maxFinal}${r.maxFinal === 100 ? ' — ' + grade(r.final) : ' (skala penuh 100 butuh verifikasi aspek lainnya)'}`);
  else console.log('  NILAI AKHIR                : tambahkan skor presentasi (maks 5 poin) oleh instruktur');
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function rowClass(score) {
  return score >= 85 ? 'good' : score >= 70 ? 'ok' : score >= 60 ? 'mid' : 'bad';
}

export function renderHTML(all) {
  const anyLive = all.some((r) => r.mode === 'live');
  const rows = all.map((r) => {
    if (r.error) {
      return `<tr class="bad"><td>${esc(r.nama)}</td><td colspan="4">Gagal dinilai: ${esc(r.error)}</td></tr>`;
    }
    const repoCell = r.repo
      ? `<a href="${esc(r.repo)}">${esc(r.repo.replace('https://github.com/', ''))}</a>`
      : '— (live-only)';
    return `<tr class="${rowClass(r.final ?? (r.autoTotal / r.maxAuto) * 100)}">
      <td>${esc(r.nama)}</td>
      <td>${repoCell}</td>
      <td>${r.autoTotal}/${r.maxAuto}</td>
      <td>${r.presentasi ?? '—'}</td>
      <td><b>${r.final !== null ? r.final + '/' + r.maxFinal + (r.maxFinal === 100 ? ' · ' + grade(r.final) : '') : 'menunggu presentasi'}</b></td>
    </tr>`;
  }).join('\n');

  const details = all.map((r) => {
    if (r.error) return '';
    const aspects = r.aspects.map((a) => {
      const checks = (a.manual || a.score === null)
        ? ''
        : '<table class="checks">' + a.checks.map((c) =>
            `<tr><td class="mark">${c.pass ? '✓' : '✗'}</td><td>${esc(c.desc)}</td><td class="pts">${c.pass ? c.points : 0}/${c.points}</td></tr>`).join('') + '</table>';
      const flags = (a.flags || []).map((f) => `<p class="flag">⚠ ${esc(f)}</p>`).join('');
      const state = a.manual ? 'manual' : a.score === null ? 'tidak terverifikasi' : a.score + '/100';
      return `<div class="aspect"><h4>${esc(a.name)} <span class="muted">(${a.weight}%)</span> — ${state}</h4>${flags}${checks}</div>`;
    }).join('');
    const meta = [];
    if (r.ctxMeta?.mode === 'live') meta.push('mode live-only · HTTP ' + (r.ctxMeta.liveStatus || '?'));
    if (r.ctxMeta?.commitCount !== null && r.ctxMeta?.commitCount !== undefined) meta.push(`${r.ctxMeta.commitCount} commit`);
    if (r.ctxMeta?.testRun) meta.push(r.ctxMeta.testRun.passed ? 'npm test: LULUS' : r.ctxMeta.testRun.ran ? 'npm test: GAGAL' : 'test tidak dijalankan');
    return `<details><summary><b>${esc(r.nama)}</b> — total otomatis ${r.autoTotal}/${r.maxAuto}${r.final !== null ? ` · nilai akhir <b>${r.final}/${r.maxFinal}${r.maxFinal === 100 ? ` (${grade(r.final)})` : ''}</b>` : ''} <span class="muted">${meta.map(esc).join(' · ')}</span></summary>${aspects}</details>`;
  }).join('\n');

  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Laporan Penilaian PawonBoga</title>
<style>
body{font-family:'Segoe UI',system-ui,sans-serif;max-width:1100px;margin:24px auto;padding:0 16px;color:#2b2116;background:#faf4e8}
h1{font-size:28px} table{width:100%;border-collapse:collapse;background:#fffdf8;margin:16px 0}
th,td{border:1px solid #e4d9c6;padding:9px 12px;text-align:left;vertical-align:top}
th{background:#f1e8d6;font-size:12px;text-transform:uppercase;letter-spacing:.05em}
tr.good td:first-child{border-left:5px solid #2f6b4f} tr.ok td:first-child{border-left:5px solid #7ba05b}
tr.mid td:first-child{border-left:5px solid #b98a2f} tr.bad td:first-child{border-left:5px solid #a63b2a}
details{background:#fffdf8;border:1px solid #e4d9c6;border-radius:12px;padding:12px 16px;margin:10px 0}
summary{cursor:pointer} .muted{color:#6e6152;font-size:13px;font-weight:400}
.aspect{margin:14px 0 6px} .aspect h4{margin:0 0 6px}
table.checks{margin:6px 0 12px} table.checks td{border:0;border-bottom:1px solid #f1e8d6;padding:5px 8px;font-size:14px}
.mark{width:24px;font-weight:700} .pts{white-space:nowrap;text-align:right;color:#6e6152}
.flag{background:#f7e3d7;border-radius:8px;padding:6px 10px;font-size:13px;margin:4px 0}
footer{margin-top:32px;color:#6e6152;font-size:13px}
</style></head><body>
<h1>Laporan Penilaian — Lab PawonBoga</h1>
<p class="muted">Dibuat otomatis oleh penilaian-pawonboga pada ${new Date().toLocaleString('id-ID')}.
Skor otomatis mencakup 6 aspek (maks 95 poin); aspek <b>Presentasi &amp; refleksi (5%)</b> dinilai manual oleh instruktur.
Skor otomatis adalah bukti awal — instruktur tetap memverifikasi sebelum memberi nilai akhir.${anyLive ? ' Peserta bertanda <i>live-only</i> dinilai tanpa repo: totalnya memakai skala poin yang terverifikasi saja, dan aspek tanpa bukti ditandai <b>tidak terverifikasi</b>.' : ''}</p>
<table><thead><tr><th>Peserta</th><th>Repo</th><th>Total otomatis</th><th>Presentasi</th><th>Nilai akhir</th></tr></thead>
<tbody>${rows}</tbody></table>
<h2>Detail per peserta</h2>
${details}
<footer>Skala nilai: ≥85 Sangat Baik · ≥70 Baik · ≥60 Cukup · &lt;60 Perlu Perbaikan.</footer>
</body></html>`;
}
