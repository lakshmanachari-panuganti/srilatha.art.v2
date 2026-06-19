'use client';
import AdminShell from '@/components/admin/AdminShell';
import { useAdminAuth } from '@/components/admin/AdminAuthProvider';

export default function AdminSettingsPage() {
  const { admin } = useAdminAuth();
  if (!admin) return null;

  return (
    <AdminShell title="Settings">
      <div className="card" style={{ padding: 'var(--sp-6)', maxWidth: 560 }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 'var(--sp-4)' }}>Your account</h2>
        <div className="admin-form-grid-2">
          <div>
            <label className="form-label">Name</label>
            <input className="form-input" value={admin.name} disabled />
          </div>
          <div>
            <label className="form-label">Email</label>
            <input className="form-input" value={admin.email} disabled />
          </div>
          <div>
            <label className="form-label">Role</label>
            <input className="form-input" value={admin.role} disabled />
          </div>
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 'var(--sp-4)' }}>
          Password rotation & multi-admin management ships in a future release.
        </p>
      </div>
    </AdminShell>
  );
}
