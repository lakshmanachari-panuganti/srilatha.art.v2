'use client';
import { useState } from 'react';
import { AdminProduct } from '@/lib/adminApi';

interface Props {
  initial?: AdminProduct;
  onSubmit: (data: Partial<AdminProduct>) => Promise<void>;
  busy?: boolean;
}

const CATEGORIES = ['resin', 'lippan', 'mandala', 'kolam', 'wedding', 'gifts'] as const;

export default function ProductForm({ initial, onSubmit, busy }: Props) {
  const [form, setForm] = useState<Partial<AdminProduct>>({
    category: initial?.category ?? 'resin',
    name: initial?.name ?? '',
    slug: initial?.slug ?? '',
    shortDesc: initial?.shortDesc ?? '',
    description: initial?.description ?? '',
    price: initial?.price ?? 0,
    originalPrice: initial?.originalPrice,
    images: initial?.images ?? [],
    material: initial?.material ?? '',
    careInstructions: initial?.careInstructions ?? '',
    dimensions: initial?.dimensions ?? '',
    inStock: initial?.inStock ?? true,
    stockCount: initial?.stockCount ?? 1,
    isBestSeller: initial?.isBestSeller ?? false,
    isNewArrival: initial?.isNewArrival ?? false,
    isSale: initial?.isSale ?? false,
    tags: initial?.tags ?? [],
    active: initial?.active ?? true,
  });
  const [imagesText, setImagesText] = useState((initial?.images ?? []).join('\n'));
  const [tagsText, setTagsText] = useState((initial?.tags ?? []).join(', '));
  const [error, setError] = useState('');

  function set<K extends keyof AdminProduct>(key: K, value: AdminProduct[K] | undefined) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await onSubmit({
        ...form,
        images: imagesText.split(/\n+/).map(s => s.trim()).filter(Boolean),
        tags: tagsText.split(',').map(s => s.trim()).filter(Boolean),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="admin-form" style={{ maxWidth: 880 }}>
      <div className="admin-form-grid-2">
        <div>
          <label className="form-label">Name *</label>
          <input className="form-input" value={form.name ?? ''} onChange={e => set('name', e.target.value)} required />
        </div>
        <div>
          <label className="form-label">Slug *</label>
          <input className="form-input" value={form.slug ?? ''} onChange={e => set('slug', e.target.value)} required />
        </div>
      </div>

      <div className="admin-form-grid-2">
        <div>
          <label className="form-label">Category *</label>
          <select className="form-input form-select" value={form.category} onChange={e => set('category', e.target.value)}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Active</label>
          <select className="form-input form-select" value={form.active ? '1' : '0'} onChange={e => set('active', e.target.value === '1')}>
            <option value="1">Active</option>
            <option value="0">Inactive</option>
          </select>
        </div>
      </div>

      <div>
        <label className="form-label">Short description</label>
        <input className="form-input" value={form.shortDesc ?? ''} onChange={e => set('shortDesc', e.target.value)} />
      </div>

      <div>
        <label className="form-label">Description</label>
        <textarea className="form-input form-textarea" value={form.description ?? ''} onChange={e => set('description', e.target.value)} rows={4} />
      </div>

      <div className="admin-form-grid-2">
        <div>
          <label className="form-label">Price (paise) *</label>
          <input type="number" className="form-input" value={form.price ?? 0} onChange={e => set('price', Number(e.target.value))} required />
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>e.g. 299900 = ₹2,999</span>
        </div>
        <div>
          <label className="form-label">Original price (paise)</label>
          <input type="number" className="form-input" value={form.originalPrice ?? ''} onChange={e => set('originalPrice', e.target.value ? Number(e.target.value) : undefined)} />
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Optional — for showing strike-through</span>
        </div>
      </div>

      <div className="admin-form-grid-2">
        <div>
          <label className="form-label">Stock count</label>
          <input type="number" className="form-input" value={form.stockCount ?? 0} onChange={e => set('stockCount', Number(e.target.value))} />
        </div>
        <div>
          <label className="form-label">In stock</label>
          <select className="form-input form-select" value={form.inStock ? '1' : '0'} onChange={e => set('inStock', e.target.value === '1')}>
            <option value="1">Yes</option>
            <option value="0">No</option>
          </select>
        </div>
      </div>

      <div>
        <label className="form-label">Images (one URL per line)</label>
        <textarea className="form-input form-textarea" value={imagesText} onChange={e => setImagesText(e.target.value)} rows={3} placeholder="/images/resin-1.png" />
      </div>

      <div>
        <label className="form-label">Tags (comma-separated)</label>
        <input className="form-input" value={tagsText} onChange={e => setTagsText(e.target.value)} placeholder="ocean, blue, gold" />
      </div>

      <div className="admin-form-grid-2">
        <div>
          <label className="form-label">Material</label>
          <input className="form-input" value={form.material ?? ''} onChange={e => set('material', e.target.value)} />
        </div>
        <div>
          <label className="form-label">Dimensions</label>
          <input className="form-input" value={form.dimensions ?? ''} onChange={e => set('dimensions', e.target.value)} />
        </div>
      </div>

      <div>
        <label className="form-label">Care instructions</label>
        <textarea className="form-input form-textarea" value={form.careInstructions ?? ''} onChange={e => set('careInstructions', e.target.value)} rows={2} />
      </div>

      <div style={{ display: 'flex', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={form.isBestSeller ?? false} onChange={e => set('isBestSeller', e.target.checked)} /> Best Seller
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={form.isNewArrival ?? false} onChange={e => set('isNewArrival', e.target.checked)} /> New Arrival
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={form.isSale ?? false} onChange={e => set('isSale', e.target.checked)} /> On Sale
        </label>
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3)', color: '#FCA5A5' }}>{error}</div>
      )}

      <button type="submit" className="btn btn-primary pulse-glow" disabled={busy}>{busy ? 'Saving…' : 'Save Product'}</button>
    </form>
  );
}
