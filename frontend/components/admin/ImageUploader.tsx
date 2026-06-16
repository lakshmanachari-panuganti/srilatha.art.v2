'use client';
import { useRef, useState } from 'react';
import { Upload, X, ImagePlus } from 'lucide-react';
import { adminApi, AdminApiError } from '@/lib/adminApi';

interface Props {
  images: string[];
  onChange: (next: string[]) => void;
}

interface PendingUpload {
  id: string;
  name: string;
  status: 'uploading' | 'error';
  error?: string;
}

export default function ImageUploader({ images, onChange }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingUpload[]>([]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    const newPending: PendingUpload[] = list.map((f, i) => ({
      id: `${Date.now()}-${i}`,
      name: f.name,
      status: 'uploading',
    }));
    setPending(prev => [...prev, ...newPending]);

    const uploaded: string[] = [];
    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      const pendingId = newPending[i].id;
      try {
        const { url } = await adminApi.uploadImage(file);
        uploaded.push(url);
        setPending(prev => prev.filter(p => p.id !== pendingId));
      } catch (err) {
        const msg = err instanceof AdminApiError ? err.message : 'Upload failed';
        setPending(prev => prev.map(p => p.id === pendingId ? { ...p, status: 'error', error: msg } : p));
      }
    }

    if (uploaded.length > 0) onChange([...images, ...uploaded]);
  }

  function removeImage(url: string) {
    onChange(images.filter(u => u !== url));
  }

  function clearPending(id: string) {
    setPending(prev => prev.filter(p => p.id !== id));
  }

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        style={{ display: 'none' }}
        onChange={e => void handleFiles(e.target.files)}
      />

      {/* Existing image grid */}
      {(images.length > 0 || pending.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 'var(--sp-3)', marginBottom: 'var(--sp-3)' }}>
          {images.map(url => (
            <div key={url} className="card" style={{ position: 'relative', padding: 0, aspectRatio: '1/1', overflow: 'hidden' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <button
                type="button"
                onClick={() => removeImage(url)}
                aria-label="Remove image"
                style={{
                  position: 'absolute', top: 6, right: 6,
                  width: 28, height: 28, borderRadius: '50%',
                  background: 'rgba(9,11,16,0.85)', border: '1px solid var(--border-mid)',
                  color: '#fff', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <X size={14} />
              </button>
            </div>
          ))}
          {pending.map(p => (
            <div key={p.id} className="card" style={{
              padding: 'var(--sp-3)', aspectRatio: '1/1',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 6, textAlign: 'center',
              borderColor: p.status === 'error' ? 'rgba(239,68,68,0.4)' : 'var(--border)',
            }}>
              {p.status === 'uploading' ? (
                <>
                  <div className="co-spinner" />
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Uploading</span>
                </>
              ) : (
                <>
                  <span style={{ fontSize: '0.7rem', color: '#FCA5A5' }}>{p.error}</span>
                  <button type="button" onClick={() => clearPending(p.id)} className="btn btn-secondary btn-sm">Dismiss</button>
                </>
              )}
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', whiteSpace: 'nowrap' }}>{p.name}</span>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="btn btn-secondary"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
      >
        {images.length === 0 ? <ImagePlus size={16} /> : <Upload size={16} />}
        {images.length === 0 ? 'Upload images' : 'Add more images'}
      </button>
      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 6 }}>
        JPEG, PNG or WebP · up to 8 MB each · first image is the main thumbnail
      </p>

      <style>{`.co-spinner { width: 18px; height: 18px; border: 2px solid var(--border); border-top-color: var(--accent-blue); border-radius: 50%; animation: spin 0.7s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
