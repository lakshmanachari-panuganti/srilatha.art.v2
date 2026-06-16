'use client';
import { useState } from 'react';
import { adminApi, AdminApiError, AdminProduct, type AiErrorCode } from '@/lib/adminApi';
import { Sparkles } from 'lucide-react';
import ImageUploader from './ImageUploader';

const AI_USER_MESSAGE: Record<AiErrorCode, string> = {
  MISSING_CONFIG:
    'AI generation isn’t configured on the server. Ask the admin to set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY and AZURE_OPENAI_DEPLOYMENT_NAME on the Function App.',
  AUTH_ERROR: 'The AI service rejected our credentials. The API key may have expired or been rotated.',
  DEPLOYMENT_NOT_FOUND: 'The configured AI model deployment was not found. Check the deployment name in Azure OpenAI.',
  RATE_LIMIT: 'AI request limit reached. Wait a minute and try again.',
  SERVICE_UNAVAILABLE: 'The AI service is temporarily unavailable. Please try again shortly.',
  TIMEOUT: 'The AI service took longer than 30 seconds to respond. Try again — sometimes the first call after a quiet period is slow.',
  IMAGE_PROCESSING_ERROR:
    'The AI service could not read this image. Try a different image, or one with clearer detail (JPEG/PNG/WebP, public URL).',
  INVALID_RESPONSE: 'The AI returned a response that didn’t match the expected shape. Try again.',
  CONTENT_VALIDATION_FAILED:
    'The AI generated content but it was missing required fields. Try again — vision results vary slightly between calls.',
  NETWORK_ERROR: 'Could not reach the AI service from the server. Check the AZURE_OPENAI_ENDPOINT setting.',
  INVALID_INPUT: 'Invalid input — please upload an image first, then click Generate.',
  INTERNAL_ERROR: 'Something went wrong on our side. The error has been logged.',
};

function aiUserMessage(err: unknown): string {
  if (err instanceof AdminApiError) {
    const code = err.code as AiErrorCode | undefined;
    if (code && AI_USER_MESSAGE[code]) return AI_USER_MESSAGE[code];
    return err.message;
  }
  return err instanceof Error ? err.message : String(err);
}

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
  const [images, setImages] = useState<string[]>(initial?.images ?? []);
  const [extraUrlsText, setExtraUrlsText] = useState('');
  const [tagsText, setTagsText] = useState((initial?.tags ?? []).join(', '));
  const [error, setError] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiSuccess, setAiSuccess] = useState('');

  function set<K extends keyof AdminProduct>(key: K, value: AdminProduct[K] | undefined) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function handleAiGenerate() {
    setAiError('');
    setAiSuccess('');
    const firstImage = images[0];
    if (!firstImage) {
      setAiError('Upload an image first — the AI needs an image to generate from.');
      return;
    }
    if (!/^https?:\/\//.test(firstImage)) {
      setAiError('The first image is a local/relative URL. Upload it to blob storage first so the AI service can fetch it.');
      return;
    }
    setAiBusy(true);
    try {
      const content = await adminApi.aiGenerateFromUrl(firstImage);
      setForm(prev => ({
        ...prev,
        name: content.title || prev.name,
        shortDesc: content.shortDescription || prev.shortDesc,
        description: content.description || prev.description,
        material: content.material || prev.material,
        careInstructions: content.careInstructions || prev.careInstructions,
      }));
      setAiSuccess('Product details generated from the image. Review and edit before saving.');
    } catch (err) {
      setAiError(aiUserMessage(err));
    } finally {
      setAiBusy(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const extraUrls = extraUrlsText.split(/\n+/).map(s => s.trim()).filter(Boolean);
    const finalImages = [...images, ...extraUrls];
    try {
      await onSubmit({
        ...form,
        images: finalImages,
        tags: tagsText.split(',').map(s => s.trim()).filter(Boolean),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="admin-form" style={{ maxWidth: 880 }}>

      {/* ─── AI generate (uses the first uploaded image) ─── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => void handleAiGenerate()}
            disabled={aiBusy || images.length === 0}
            className="btn btn-primary pulse-glow"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            <Sparkles size={16} />
            {aiBusy ? 'Generating…' : 'Generate Product Details'}
          </button>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            {images.length === 0
              ? 'Upload at least one image first — the AI generates name, descriptions, material and care from the image.'
              : 'Reads the first image and auto-fills name, descriptions, material and care.'}
          </span>
        </div>
        {aiSuccess && (
          <div style={{ background: 'rgba(0,230,118,0.08)', border: '1px solid rgba(0,230,118,0.3)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3)', fontSize: '0.82rem', color: 'var(--accent-green)' }}>
            {aiSuccess}
          </div>
        )}
        {aiError && (
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3)', fontSize: '0.82rem', color: '#FCA5A5', lineHeight: 1.55 }}>
            {aiError}
          </div>
        )}
      </div>

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
        <label className="form-label">Images</label>
        <ImageUploader images={images} onChange={setImages} />
      </div>

      <details style={{ marginTop: -8 }}>
        <summary style={{ fontSize: '0.78rem', color: 'var(--text-muted)', cursor: 'pointer' }}>Or paste image URLs (one per line)</summary>
        <textarea
          className="form-input form-textarea"
          value={extraUrlsText}
          onChange={e => setExtraUrlsText(e.target.value)}
          rows={3}
          placeholder="https://&lt;storage-account&gt;.blob.core.windows.net/products/abc.jpg"
          style={{ marginTop: 8 }}
        />
      </details>

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
