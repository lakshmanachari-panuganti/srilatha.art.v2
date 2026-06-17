// Reads artifacts/results.json (written by run-validation.mjs) and emits a
// self-contained artifacts/report.html that can be browsed locally after
// downloading the artifact zip — screenshots are referenced by relative path.

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ART = 'artifacts';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const STATUS_COLORS = { pass: '#3fb950', warn: '#d29922', fail: '#f85149' };
const STATUS_LABELS = { pass: 'PASS', warn: 'WARN', fail: 'FAIL' };

function badge(status) {
  return `<span class="badge" style="background:${STATUS_COLORS[status] ?? '#8b949e'}">${STATUS_LABELS[status] ?? '???'}</span>`;
}

function renderConsoleErrors(list) {
  if (!list?.length) return '';
  return `
    <div class="block">
      <strong>Console errors (${list.length}):</strong>
      <ul>${list.map((e) => `<li><code>${esc(e.text)}</code></li>`).join('')}</ul>
    </div>`;
}

function renderFailedRequests(list) {
  if (!list?.length) return '';
  return `
    <div class="block">
      <strong>Failed/error responses (${list.length}):</strong>
      <ul>${list.map((r) => `<li><code>${esc(r.method ?? '')} ${esc(r.url)}</code> &mdash; ${esc(r.httpStatus ?? r.failure ?? 'unknown')}</li>`).join('')}</ul>
    </div>`;
}

function renderResponsive(r) {
  if (!r) return '';
  if (!r.horizontalScroll) return '';
  return `<div class="block warn"><strong>Mobile layout:</strong> horizontal overflow detected (scrollWidth=${r.scrollWidth}px, clientWidth=${r.clientWidth}px)</div>`;
}

function renderA11y(a) {
  if (!a) return '';
  if (a.error) return `<div class="block warn"><strong>Accessibility scan error:</strong> <code>${esc(a.error)}</code></div>`;
  if (!a.violations) return '<div class="block ok"><strong>Accessibility:</strong> no serious/critical violations.</div>';
  return `
    <div class="block warn">
      <strong>Accessibility:</strong> ${a.violations} serious/critical violation(s).
      <ul>
        ${a.items.map((v) => `
          <li>
            <code>${esc(v.id)}</code>
            <span class="pill pill-${esc(v.impact)}">${esc(v.impact)}</span>
            &mdash; ${esc(v.description)} (${v.nodes} node${v.nodes === 1 ? '' : 's'})
            ${v.helpUrl ? `<a href="${esc(v.helpUrl)}" target="_blank" rel="noopener">docs</a>` : ''}
          </li>
        `).join('')}
      </ul>
    </div>`;
}

function renderSteps(steps) {
  if (!steps?.length) return '';
  return `
    <div class="block">
      <strong>Steps:</strong>
      <ol>${steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
    </div>`;
}

function renderScreenshot(name) {
  if (!name) return '';
  return `
    <div class="block">
      <strong>Screenshot:</strong><br>
      <a href="screenshots/${esc(name)}" target="_blank" rel="noopener"><img src="screenshots/${esc(name)}" alt="${esc(name)}" loading="lazy"></a>
    </div>`;
}

function renderCheck(check) {
  const { category, name, status, durationMs, details = {} } = check;
  return `
    <details class="check check-${status}">
      <summary>
        ${badge(status)}
        <span class="cat">${esc(category)}</span>
        <span class="name">${esc(name)}</span>
        <span class="duration">${durationMs}ms</span>
      </summary>
      <div class="body">
        ${details.url ? `<div><strong>URL:</strong> <code>${esc(details.url)}</code></div>` : ''}
        ${details.httpStatus ? `<div><strong>HTTP:</strong> ${esc(details.httpStatus)}</div>` : ''}
        ${details.title ? `<div><strong>Title:</strong> ${esc(details.title)}</div>` : ''}
        ${details.navError ? `<div class="block err"><strong>Navigation error:</strong> <code>${esc(details.navError)}</code></div>` : ''}
        ${details.error ? `<div class="block err"><strong>Error:</strong> <code>${esc(details.error)}</code></div>` : ''}
        ${details.note ? `<div class="block warn"><strong>Note:</strong> ${esc(details.note)}</div>` : ''}
        ${renderSteps(details.steps)}
        ${renderConsoleErrors(details.consoleErrors)}
        ${renderFailedRequests(details.failedRequests)}
        ${renderResponsive(details.responsive)}
        ${renderA11y(details.a11y)}
        ${renderScreenshot(details.screenshot)}
      </div>
    </details>`;
}

async function main() {
  const raw = await readFile(join(ART, 'results.json'), 'utf-8');
  const data = JSON.parse(raw);
  const { meta, summary, checks } = data;

  const byCategory = checks.reduce((acc, c) => {
    (acc[c.category] = acc[c.category] || []).push(c);
    return acc;
  }, {});

  const sections = Object.entries(byCategory)
    .map(([cat, items]) => {
      const passes = items.filter((i) => i.status === 'pass').length;
      const warns = items.filter((i) => i.status === 'warn').length;
      const fails = items.filter((i) => i.status === 'fail').length;
      return `
        <section>
          <h2>${esc(cat)} <small>${passes} pass / ${warns} warn / ${fails} fail</small></h2>
          ${items.map(renderCheck).join('')}
        </section>`;
    })
    .join('');

  const fatal = meta.fatalError
    ? `<div class="fatal"><strong>Fatal error mid-run:</strong> <code>${esc(meta.fatalError)}</code></div>`
    : '';

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Post-Deployment Validation · ${esc((meta.env ?? '').toUpperCase())}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #0d1117; color: #e6edf3; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.5; }
  .wrap { max-width: 1100px; margin: 0 auto; padding: 32px 24px 80px; }
  h1 { font-size: 1.7rem; margin: 0 0 8px; letter-spacing: -0.01em; }
  .meta { color: #8b949e; font-size: 0.88rem; line-height: 1.7; }
  .meta code { background: #161b22; padding: 1px 6px; border-radius: 4px; font-size: 0.82rem; }
  .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin: 24px 0; }
  .stat { background: #161b22; border: 1px solid #30363d; border-radius: 10px; padding: 14px 16px; }
  .stat .v { font-size: 1.8rem; font-weight: 700; line-height: 1.1; }
  .stat .l { font-size: 0.72rem; color: #8b949e; text-transform: uppercase; letter-spacing: 0.08em; margin-top: 4px; }
  .stat.pass { border-color: #1f6f3a; }
  .stat.warn { border-color: #6b4d1b; }
  .stat.fail { border-color: #6b1b1b; }
  .stat.pass .v { color: ${STATUS_COLORS.pass}; }
  .stat.warn .v { color: ${STATUS_COLORS.warn}; }
  .stat.fail .v { color: ${STATUS_COLORS.fail}; }
  section { margin: 32px 0; }
  section h2 { font-size: 1.05rem; margin: 0 0 12px; padding-bottom: 6px; border-bottom: 1px solid #30363d; display: flex; gap: 10px; align-items: center; }
  section h2 small { color: #8b949e; font-weight: 400; font-size: 0.78rem; }
  details.check { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 10px 14px; margin: 8px 0; }
  details.check[open] { background: #161b22; }
  details.check summary { cursor: pointer; display: flex; gap: 10px; align-items: center; list-style: none; }
  details.check summary::-webkit-details-marker { display: none; }
  details.check.check-fail { border-color: #6b1b1b; }
  details.check.check-warn { border-color: #6b4d1b; }
  details.check.check-pass { border-color: #1f6f3a; }
  .badge { display: inline-block; min-width: 56px; text-align: center; color: white; font-size: 0.7rem; font-weight: 700; padding: 3px 8px; border-radius: 4px; letter-spacing: 0.05em; }
  .cat { color: #8b949e; font-size: 0.82rem; }
  .name { flex: 1; }
  .duration { color: #8b949e; font-size: 0.78rem; }
  .body { margin-top: 12px; padding-top: 12px; border-top: 1px solid #30363d; font-size: 0.88rem; }
  .body code { background: #0d1117; padding: 1px 6px; border-radius: 4px; font-size: 0.82rem; word-break: break-all; }
  .body ul, .body ol { padding-left: 20px; margin: 6px 0; }
  .body .block { margin: 12px 0; }
  .body .err { color: #ff7b7b; }
  .body .warn { color: #ffc46b; }
  .body .ok { color: #7ee787; }
  .body img { max-width: 100%; margin-top: 8px; border: 1px solid #30363d; border-radius: 6px; display: block; }
  .pill { display: inline-block; padding: 0 6px; border-radius: 4px; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; margin: 0 4px; }
  .pill-critical { background: #f85149; color: white; }
  .pill-serious  { background: #d29922; color: #0d1117; }
  .fatal { background: rgba(248,81,73,0.1); border: 1px solid #6b1b1b; padding: 16px; border-radius: 8px; margin: 16px 0; }
  footer { color: #8b949e; font-size: 0.78rem; margin-top: 40px; text-align: center; }
  a { color: #58a6ff; }
</style>
</head>
<body>
<div class="wrap">
  <h1>Post-Deployment Validation Report</h1>
  <div class="meta">
    Environment: <strong>${esc((meta.env ?? '').toUpperCase())}</strong><br>
    Site URL: <code>${esc(meta.siteUrl)}</code><br>
    API URL: <code>${esc(meta.apiUrl)}</code><br>
    Started: <code>${esc(meta.startedAt)}</code><br>
    Finished: <code>${esc(meta.finishedAt)}</code><br>
    Duration: <strong>${((meta.durationMs ?? 0) / 1000).toFixed(1)}s</strong>
  </div>

  ${fatal}

  <div class="summary">
    <div class="stat"><div class="v">${summary.total}</div><div class="l">Total checks</div></div>
    <div class="stat pass"><div class="v">${summary.passed}</div><div class="l">Passed</div></div>
    <div class="stat warn"><div class="v">${summary.warned}</div><div class="l">Warnings</div></div>
    <div class="stat fail"><div class="v">${summary.failed}</div><div class="l">Failed</div></div>
  </div>

  ${sections}

  <footer>Generated by <code>tests/post-deploy/generate-report.mjs</code>.</footer>
</div>
</body>
</html>`;

  await writeFile(join(ART, 'report.html'), html);
  console.log('Wrote artifacts/report.html');
}

main().catch((e) => {
  console.error('Failed to generate HTML report:', e);
  process.exit(1);
});
