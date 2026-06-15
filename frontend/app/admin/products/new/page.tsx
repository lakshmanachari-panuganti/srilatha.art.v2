'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminShell from '@/components/admin/AdminShell';
import ProductForm from '@/components/admin/ProductForm';
import { adminApi, AdminApiError } from '@/lib/adminApi';

export default function NewProductPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <AdminShell title="Add product">
      <ProductForm
        busy={busy}
        onSubmit={async data => {
          setBusy(true);
          try {
            const created = await adminApi.createProduct(data);
            router.push(`/admin/products/edit?id=${encodeURIComponent(created.id)}`);
          } catch (err) {
            const msg = err instanceof AdminApiError ? err.message : 'Create failed';
            throw new Error(msg);
          } finally { setBusy(false); }
        }}
      />
    </AdminShell>
  );
}
