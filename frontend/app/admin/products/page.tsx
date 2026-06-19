'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import AdminShell from '@/components/admin/AdminShell';
import { adminApi, AdminApiError, AdminProduct } from '@/lib/adminApi';
import { formatPrice } from '@/lib/data';
import { Plus, Pencil, Trash2 } from 'lucide-react';

export default function AdminProductsPage() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const res = await adminApi.listProducts();
      setProducts(res.products);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Failed to load products');
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  async function handleDelete(id: string) {
    if (!confirm('Mark this product inactive? It will be hidden from the storefront.')) return;
    try {
      await adminApi.deleteProduct(id);
      void load();
    } catch (err) {
      alert(err instanceof AdminApiError ? err.message : 'Delete failed');
    }
  }

  const filtered = search.trim()
    ? products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.slug.includes(search.toLowerCase()))
    : products;

  return (
    <AdminShell title="Products">
      <div className="admin-toolbar">
        <input
          type="search"
          className="admin-search-input"
          placeholder="Search by name or slug…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div style={{ flex: 1 }} />
        <Link href="/admin/products/new" className="btn btn-primary">
          <Plus size={16} /> Add Product
        </Link>
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3)', color: '#FCA5A5', marginBottom: 'var(--sp-4)' }}>{error}</div>
      )}

      {loading ? (
        <div className="admin-empty">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="admin-empty">No products yet. <Link href="/admin/products/new" style={{ color: 'var(--accent-blue)' }}>Add the first one</Link>.</div>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Category</th>
              <th>Price</th>
              <th>Stock</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.id}>
                <td>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{p.name}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{p.slug}</div>
                </td>
                <td style={{ textTransform: 'capitalize' }}>{p.category}</td>
                <td>{formatPrice(p.price)}</td>
                <td style={{ color: p.stockCount === 0 ? '#FF6B6B' : p.stockCount < 5 ? 'var(--accent-gold)' : 'var(--text-primary)' }}>{p.stockCount}</td>
                <td>
                  <span className={`admin-status-pill ${p.active ? 'admin-status-delivered' : 'admin-status-cancelled'}`}>
                    {p.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="admin-table-actions">
                  <Link href={`/admin/products/edit?id=${encodeURIComponent(p.id)}`} className="btn btn-secondary btn-sm"><Pencil size={14} /> Edit</Link>
                  <button onClick={() => handleDelete(p.id)} className="btn btn-secondary btn-sm" style={{ color: '#FF6B6B' }}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AdminShell>
  );
}
