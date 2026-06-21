'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import AdminShell from '@/components/admin/AdminShell';
import { adminApi, AdminApiError, AdminIssue, AdminIssueSeverity } from '@/lib/adminApi';

type StatusFilter = '' | 'open' | 'resolved';
type SeverityFilter = '' | AdminIssueSeverity;

const SEVERITIES: SeverityFilter[] = ['', 'critical', 'error', 'warning'];
const STATUSES: StatusFilter[] = ['', 'open', 'resolved'];
const DAYS: Array<{ label: string; value: number | null }> = [
  { label: 'All time', value: null },
  { label: 'Last 24h', value: 1 },
  { label: 'Last 7 days', value: 7 },
  { label: 'Last 30 days', value: 30 },
];

const SEVERITY_COLOR: Record<AdminIssueSeverity, string> = {
  critical: '#FF4D4D',
  error: '#FCA5A5',
  warning: '#F4C04D',
};

function fmt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function sinceISO(days: number | null): string | undefined {
  if (days === null) return undefined;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export default function AdminLogsPage() {
  const [status, setStatus] = useState<StatusFilter>('open');
  const [service, setService] = useState<string>('');
  const [severity, setSeverity] = useState<SeverityFilter>('');
  const [days, setDays] = useState<number | null>(null);

  const [issues, setIssues] = useState<AdminIssue[]>([]);
  const [summary, setSummary] = useState<{ byService: Record<string, number>; bySeverity: Record<string, number> }>(
    { byService: {}, bySeverity: {} },
  );
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [resolving, setResolving] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminApi.listIssues({
        status: status === '' ? undefined : status,
        service: service || undefined,
        severity: severity === '' ? undefined : severity,
        since: sinceISO(days),
        limit: 500,
      });
      setIssues(res.issues);
      setSummary(res.summary);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Failed to load issues');
    } finally {
      setLoading(false);
    }
  }, [status, service, severity, days]);

  useEffect(() => { void load(); }, [load]);

  const services = useMemo(() => Object.keys(summary.byService).sort(), [summary.byService]);

  async function resolve(id: string) {
    setResolving(prev => new Set(prev).add(id));
    try {
      await adminApi.resolveIssue(id);
      await load();
    } catch (err) {
      alert(err instanceof AdminApiError ? err.message : 'Failed to resolve');
    } finally {
      setResolving(prev => { const next = new Set(prev); next.delete(id); return next; });
    }
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <AdminShell title="Logs">
      <div className="admin-toolbar" style={{ flexWrap: 'wrap', gap: 'var(--sp-2)' }}>
        <select className="admin-select" value={status} onChange={e => setStatus(e.target.value as StatusFilter)}>
          {STATUSES.map(s => <option key={s || 'all'} value={s}>{s ? `Status: ${s}` : 'Status: all'}</option>)}
        </select>

        <select className="admin-select" value={service} onChange={e => setService(e.target.value)}>
          <option value="">Service: all</option>
          {services.map(s => <option key={s} value={s}>Service: {s}</option>)}
        </select>

        <select className="admin-select" value={severity} onChange={e => setSeverity(e.target.value as SeverityFilter)}>
          {SEVERITIES.map(s => <option key={s || 'all'} value={s}>{s ? `Severity: ${s}` : 'Severity: all'}</option>)}
        </select>

        <select className="admin-select" value={days ?? ''} onChange={e => setDays(e.target.value === '' ? null : Number(e.target.value))}>
          {DAYS.map(d => <option key={d.label} value={d.value ?? ''}>{d.label}</option>)}
        </select>

        <button
          className="btn btn-secondary btn-sm"
          onClick={() => void load()}
          disabled={loading}
          style={{ marginLeft: 'auto' }}
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className="admin-stats-grid" style={{ marginTop: 'var(--sp-4)' }}>
        <Tile label="Total in view" value={String(total)} />
        <Tile label="Critical" value={String(summary.bySeverity.critical ?? 0)} accent={SEVERITY_COLOR.critical} />
        <Tile label="Error" value={String(summary.bySeverity.error ?? 0)} accent={SEVERITY_COLOR.error} />
        <Tile label="Warning" value={String(summary.bySeverity.warning ?? 0)} accent={SEVERITY_COLOR.warning} />
      </div>

      {Object.keys(summary.byService).length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)', marginTop: 'var(--sp-4)' }}>
          {Object.entries(summary.byService).sort((a, b) => b[1] - a[1]).map(([svc, n]) => (
            <button
              key={svc}
              onClick={() => setService(s => s === svc ? '' : svc)}
              className="admin-status-pill"
              style={{
                cursor: 'pointer',
                background: service === svc ? 'rgba(0,163,255,0.18)' : undefined,
                border: service === svc ? '1px solid rgba(0,163,255,0.45)' : undefined,
              }}
            >
              {svc} · {n}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div style={{ color: '#FCA5A5', marginTop: 'var(--sp-4)' }}>{error}</div>
      )}

      <div style={{ marginTop: 'var(--sp-5)' }}>
        {loading && issues.length === 0 ? (
          <div className="admin-empty">Loading…</div>
        ) : issues.length === 0 ? (
          <div className="admin-empty">No issues match these filters. 🎉</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
            {issues.map(issue => {
              const isExpanded = expanded.has(issue.id);
              const isResolving = resolving.has(issue.id);
              return (
                <div
                  key={issue.id}
                  className="card"
                  style={{
                    padding: 'var(--sp-3) var(--sp-4)',
                    borderLeft: `3px solid ${SEVERITY_COLOR[issue.severity]}`,
                    opacity: issue.status === 'resolved' ? 0.75 : 1,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--sp-3)', alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        <span style={{ color: SEVERITY_COLOR[issue.severity], fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          {issue.severity}
                        </span>
                        <span>·</span>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{issue.service}</span>
                        <span>·</span>
                        <span>{fmt(issue.lastSeenAt)}</span>
                        {issue.count > 1 && (
                          <>
                            <span>·</span>
                            <span>×{issue.count} (first {fmt(issue.firstSeenAt)})</span>
                          </>
                        )}
                        {issue.orderId && (
                          <>
                            <span>·</span>
                            <span style={{ fontFamily: 'monospace' }}>{issue.orderId}</span>
                          </>
                        )}
                        <span className={`admin-status-pill admin-status-${issue.status}`} style={{ marginLeft: 'auto' }}>
                          {issue.status}
                        </span>
                      </div>
                      <p style={{ color: 'var(--text-primary)', marginTop: 'var(--sp-2)', fontWeight: 600 }}>
                        {issue.message}
                      </p>
                      {issue.detail && isExpanded && (
                        <pre style={{
                          marginTop: 'var(--sp-2)',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          fontSize: '0.72rem',
                          background: 'rgba(0,0,0,0.3)',
                          padding: 'var(--sp-2) var(--sp-3)',
                          borderRadius: 'var(--r-sm)',
                          color: 'var(--text-secondary)',
                          maxHeight: 300,
                          overflow: 'auto',
                        }}>
                          {issue.detail}
                        </pre>
                      )}
                      {issue.status === 'resolved' && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 'var(--sp-2)' }}>
                          Resolved {issue.resolvedAt ? `at ${fmt(issue.resolvedAt)}` : ''}
                          {issue.resolvedBy ? ` by ${issue.resolvedBy === 'auto' ? 'auto-heal' : issue.resolvedBy}` : ''}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)', alignItems: 'flex-end' }}>
                      {issue.detail && (
                        <button className="btn btn-secondary btn-sm" onClick={() => toggleExpand(issue.id)}>
                          {isExpanded ? 'Hide detail' : 'Show detail'}
                        </button>
                      )}
                      {issue.status === 'open' && (
                        <button
                          className="btn btn-green btn-sm"
                          onClick={() => void resolve(issue.id)}
                          disabled={isResolving}
                        >
                          {isResolving ? 'Resolving…' : 'Resolve'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminShell>
  );
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="admin-stat" style={accent ? { borderLeft: `3px solid ${accent}` } : undefined}>
      <div className="admin-stat-label">{label}</div>
      <div className="admin-stat-value" style={accent ? { color: accent } : undefined}>{value}</div>
    </div>
  );
}
