'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AdminShell from '@/components/admin/AdminShell';
import ProductForm from '@/components/admin/ProductForm';
import { adminApi, AdminApiError, AdminProduct } from '@/lib/adminApi';

function EditInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const id = sp.get('id') ?? '';
  const [product, setProduct] = useState<AdminProduct | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) { setError('Missing product id'); return; }
    adminApi.listProducts()
      .then(res => {
        const p = res.products.find(x => x.id === id);
        if (!p) setError('Product not found');
        else setProduct(p);
      })
      .catch(err => setError(err instanceof AdminApiError ? err.message : 'Failed to load'));
  }, [id]);

  return (
    <AdminShell title={product ? `Edit: ${product.name}` : 'Edit product'}>
      {error && <div style={{ color: '#FCA5A5', marginBottom: 'var(--sp-4)' }}>{error}</div>}
      {!product && !error && <div className="admin-empty">Loading…</div>}
      {product && (
        <ProductForm
          initial={product}
          busy={busy}
          onSubmit={async data => {
            setBusy(true);
            try {
              await adminApi.updateProduct(id, data);
              router.push('/admin/products');
            } catch (err) {
              throw new Error(err instanceof AdminApiError ? err.message : 'Save failed');
            } finally { setBusy(false); }
          }}
        />
      )}
    </AdminShell>
  );
}

export default function Page() {
  return <Suspense fallback={null}><EditInner /></Suspense>;
}
