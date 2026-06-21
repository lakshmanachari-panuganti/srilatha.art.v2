import { odata } from '@azure/data-tables';
import { randomUUID, createHash } from 'node:crypto';
import { queryEntities, upsertEntity, deleteEntity } from './tableStorage';

// ---------------------------------------------------------------------------
// Operational issue log.
//
// Every recorded issue is one row in the `systemIssues` table:
//   PartitionKey: 'open' | 'resolved'
//   RowKey:       stable UUID (preserved across resolve transitions)
//
// Dedup model: callers pass (or accept a derived) `fingerprint`. If an open
// row with the same fingerprint exists, we bump `count` and `lastSeenAt`
// instead of creating a duplicate row. Auto-resolve uses the same fingerprint
// — a successful operation calls resolveOpenIssues(service, fingerprint) and
// every matching open row flips to resolved.
//
// Best-effort by design: every public function swallows its own errors and
// `console.error`s. Logging the error must never break the calling flow.
// ---------------------------------------------------------------------------

export type IssueSeverity = 'critical' | 'error' | 'warning';

export interface RecordIssueInput {
  service: string;          // 'razorpay' | 'whatsapp' | 'email' | 'orders' | 'razorpay-webhook' | ...
  severity: IssueSeverity;
  message: string;          // short, human-readable
  detail?: string;          // full payload / stack / upstream body
  orderId?: string;
  fingerprint?: string;     // override the default derived key
}

export interface IssueEntity {
  partitionKey: 'open' | 'resolved';
  rowKey: string;
  service: string;
  severity: IssueSeverity;
  message: string;
  detail?: string;
  orderId?: string;
  fingerprint: string;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt?: string;
  resolvedBy?: string;      // 'auto' for self-heal, admin email otherwise
}

const TABLE = 'systemIssues';

function deriveFingerprint(input: RecordIssueInput): string {
  if (input.fingerprint) return input.fingerprint;
  // Hash service + message so a stable signature collapses repeats without
  // needing the caller to think about it. We deliberately do NOT include
  // detail or orderId — those vary per occurrence and would defeat dedup.
  const sig = `${input.service}|${input.message}`;
  return createHash('sha1').update(sig).digest('hex').slice(0, 16);
}

/**
 * Record an operational issue. If an open issue with the same fingerprint
 * exists, increments its count and updates lastSeenAt instead of creating a
 * new row. Returns the row id (existing or newly minted), or null on failure.
 */
export async function recordIssue(input: RecordIssueInput): Promise<string | null> {
  try {
    const fingerprint = deriveFingerprint(input);
    const now = new Date().toISOString();

    const existing = await queryEntities<IssueEntity>(
      TABLE,
      odata`PartitionKey eq 'open' and fingerprint eq ${fingerprint}`,
    );

    if (existing.length > 0) {
      const row = existing[0];
      const updated: IssueEntity = {
        ...row,
        count: (row.count ?? 1) + 1,
        lastSeenAt: now,
        // Keep the freshest detail/message so the operator sees current state.
        message: input.message,
        ...(input.detail !== undefined ? { detail: input.detail } : {}),
        ...(input.orderId !== undefined ? { orderId: input.orderId } : {}),
        // Severity can escalate but not silently downgrade.
        severity: severityRank(input.severity) > severityRank(row.severity)
          ? input.severity
          : row.severity,
      };
      await upsertEntity(TABLE, updated);
      return row.rowKey;
    }

    const id = randomUUID();
    const row: IssueEntity = {
      partitionKey: 'open',
      rowKey: id,
      service: input.service,
      severity: input.severity,
      message: input.message,
      ...(input.detail !== undefined ? { detail: input.detail } : {}),
      ...(input.orderId !== undefined ? { orderId: input.orderId } : {}),
      fingerprint,
      count: 1,
      firstSeenAt: now,
      lastSeenAt: now,
    };
    await upsertEntity(TABLE, row);
    return id;
  } catch (err) {
    console.error('recordIssue failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Auto-resolve every open issue matching (service, fingerprint). Called from
 * the success path of an operation — e.g. a successful WhatsApp send flips
 * the matching open 'whatsapp api-error' issue to resolved.
 *
 * If callers don't have a fingerprint handy, they can pass the same message
 * they would've passed to recordIssue and it'll derive the same one.
 */
export async function resolveOpenIssues(args: {
  service: string;
  fingerprint?: string;
  message?: string;
  resolvedBy?: string;
}): Promise<number> {
  try {
    const fingerprint =
      args.fingerprint ??
      (args.message
        ? deriveFingerprint({ service: args.service, severity: 'error', message: args.message })
        : null);
    if (!fingerprint) return 0;

    const open = await queryEntities<IssueEntity>(
      TABLE,
      odata`PartitionKey eq 'open' and service eq ${args.service} and fingerprint eq ${fingerprint}`,
    );
    if (open.length === 0) return 0;

    const resolvedAt = new Date().toISOString();
    const resolvedBy = args.resolvedBy ?? 'auto';
    let n = 0;
    for (const row of open) {
      try {
        // Insert into 'resolved' first; if that succeeds, drop the 'open' copy.
        // A crash between the two leaves a duplicate (acceptable for logs) but
        // never silently loses the row.
        const resolved: IssueEntity = {
          ...row,
          partitionKey: 'resolved',
          resolvedAt,
          resolvedBy,
        };
        await upsertEntity(TABLE, resolved);
        await deleteEntity(TABLE, 'open', row.rowKey);
        n++;
      } catch (err) {
        console.error('resolveOpenIssues row failed:', err instanceof Error ? err.message : err);
      }
    }
    return n;
  } catch (err) {
    console.error('resolveOpenIssues failed:', err instanceof Error ? err.message : err);
    return 0;
  }
}

/**
 * Resolve a single issue by id (admin clicked "Resolve" in the UI).
 */
export async function resolveIssueById(args: {
  id: string;
  resolvedBy: string;
}): Promise<boolean> {
  try {
    const open = await queryEntities<IssueEntity>(
      TABLE,
      odata`PartitionKey eq 'open' and RowKey eq ${args.id}`,
    );
    if (open.length === 0) return false;
    const row = open[0];
    const resolved: IssueEntity = {
      ...row,
      partitionKey: 'resolved',
      resolvedAt: new Date().toISOString(),
      resolvedBy: args.resolvedBy,
    };
    await upsertEntity(TABLE, resolved);
    await deleteEntity(TABLE, 'open', row.rowKey);
    return true;
  } catch (err) {
    console.error('resolveIssueById failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

function severityRank(s: IssueSeverity): number {
  switch (s) {
    case 'critical': return 3;
    case 'error': return 2;
    case 'warning': return 1;
  }
}
