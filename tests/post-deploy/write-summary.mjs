// Writes a compact GitHub-flavored markdown summary to stdout. The workflow
// pipes this into $GITHUB_STEP_SUMMARY. The full detail goes into the HTML
// artifact (generate-report.mjs); this is the at-a-glance view.

import { readFile } from 'node:fs/promises';

const ICONS = { pass: '✅', warn: '⚠️', fail: '❌' };

function fence(s) {
  return '`' + String(s ?? '').replace(/`/g, "'") + '`';
}

async function main() {
  let data;
  try {
    data = JSON.parse(await readFile('artifacts/results.json', 'utf-8'));
  } catch (e) {
    console.log('# Post-Deployment Validation\n');
    console.log(`> Could not read results.json — the runner may have crashed before writing. Error: ${String(e?.message ?? e)}`);
    return;
  }

  const { meta, summary, checks } = data;
  const out = [];

  out.push(`# Post-Deployment Validation — ${(meta.env ?? '').toUpperCase()}`);
  out.push('');
  out.push(`- **Site:** ${meta.siteUrl}`);
  out.push(`- **API:** ${meta.apiUrl}`);
  out.push(`- **Duration:** ${((meta.durationMs ?? 0) / 1000).toFixed(1)}s`);
  out.push(`- **Started:** ${meta.startedAt}`);
  if (meta.fatalError) {
    out.push('');
    out.push(`> ⚠️ Runner hit a fatal error: ${fence(meta.fatalError)}. Some checks may be missing.`);
  }
  out.push('');

  out.push(`| Status | Count |`);
  out.push(`|--------|------:|`);
  out.push(`| ✅ Passed   | ${summary.passed} |`);
  out.push(`| ⚠️ Warnings | ${summary.warned} |`);
  out.push(`| ❌ Failed   | ${summary.failed} |`);
  out.push(`| **Total**   | **${summary.total}** |`);
  out.push('');

  // ── Per-category tables ────────────────────────────────────────────────
  const byCategory = checks.reduce((acc, c) => {
    (acc[c.category] = acc[c.category] || []).push(c);
    return acc;
  }, {});

  for (const [cat, items] of Object.entries(byCategory)) {
    out.push(`## ${cat}`);
    out.push('');
    out.push('| | Check | HTTP | Duration | Notes |');
    out.push('|---|-------|-----:|---------:|-------|');
    for (const c of items) {
      const icon = ICONS[c.status] ?? '·';
      const http = c.details?.httpStatus ?? '—';
      const notes = [];
      if (c.details?.consoleErrors?.length) notes.push(`${c.details.consoleErrors.length} console error(s)`);
      if (c.details?.failedRequests?.length) notes.push(`${c.details.failedRequests.length} failed req(s)`);
      if (c.details?.responsive?.horizontalScroll) notes.push('horizontal scroll');
      if (c.details?.a11y?.violations) notes.push(`${c.details.a11y.violations} a11y issue(s)`);
      if (c.details?.error) notes.push(`error: ${c.details.error.slice(0, 80)}`);
      if (c.details?.navError) notes.push(`nav: ${c.details.navError.slice(0, 80)}`);
      const cell = (s) => String(s).replace(/\|/g, '\\|');
      out.push(`| ${icon} | ${cell(c.name)} | ${http} | ${c.durationMs}ms | ${cell(notes.join('; ') || '—')} |`);
    }
    out.push('');
  }

  // ── Detailed failure breakdown ─────────────────────────────────────────
  const failures = checks.filter((c) => c.status === 'fail');
  if (failures.length) {
    out.push(`## ❌ Failure detail`);
    out.push('');
    for (const c of failures) {
      out.push(`### ${c.category} — ${c.name}`);
      if (c.details?.url) out.push(`- URL: ${fence(c.details.url)}`);
      if (c.details?.httpStatus !== undefined) out.push(`- HTTP: ${c.details.httpStatus}`);
      if (c.details?.navError) out.push(`- Nav error: ${fence(c.details.navError)}`);
      if (c.details?.error) out.push(`- Error: ${fence(c.details.error)}`);
      if (c.details?.consoleErrors?.length) {
        out.push(`- Console errors:`);
        c.details.consoleErrors.slice(0, 5).forEach((e) => out.push(`  - ${fence(e.text)}`));
      }
      if (c.details?.failedRequests?.length) {
        out.push(`- Failed requests:`);
        c.details.failedRequests.slice(0, 5).forEach((r) => {
          out.push(`  - ${fence(`${r.method ?? ''} ${r.url}`)} → ${r.httpStatus ?? r.failure ?? 'unknown'}`);
        });
      }
      out.push('');
    }
  }

  out.push('');
  out.push(`📥 **Full HTML report:** download the \`validation-report-${meta.env}-*\` artifact from this run.`);

  console.log(out.join('\n'));
}

main().catch((e) => {
  console.log('# Post-Deployment Validation\n');
  console.log(`> write-summary.mjs failed: ${String(e?.message ?? e)}`);
});
