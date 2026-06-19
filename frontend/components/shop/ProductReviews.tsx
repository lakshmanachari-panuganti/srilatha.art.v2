'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/auth/AuthProvider';
import { listProductReviews, submitProductReview, ApiError, type PublicReview } from '@/lib/api';

interface Props {
  productId: string;
  productName: string;
}

function Stars({ value, size = '1rem' }: { value: number; size?: string }) {
  return (
    <span style={{ fontSize: size, color: 'var(--accent-gold)' }} aria-label={`${value} out of 5`}>
      {'★'.repeat(Math.max(0, Math.min(5, Math.round(value))))}
      <span style={{ color: 'var(--text-dim)' }}>
        {'★'.repeat(5 - Math.max(0, Math.min(5, Math.round(value))))}
      </span>
    </span>
  );
}

function StarPicker({ value, onChange, disabled }: { value: number; onChange: (n: number) => void; disabled?: boolean }) {
  return (
    <div style={{ display: 'inline-flex', gap: 4 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          aria-label={`Rate ${i} ${i === 1 ? 'star' : 'stars'}`}
          aria-pressed={value >= i}
          disabled={disabled}
          onClick={() => onChange(i)}
          style={{
            background: 'none',
            border: 'none',
            cursor: disabled ? 'not-allowed' : 'pointer',
            padding: 2,
            fontSize: '1.4rem',
            lineHeight: 1,
            color: i <= value ? 'var(--accent-gold)' : 'var(--text-dim)',
            transition: 'transform 0.12s ease',
          }}
          onMouseEnter={(e) => { if (!disabled) (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.1)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'none'; }}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export default function ProductReviews({ productId, productName }: Props) {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<PublicReview[]>([]);
  const [loading, setLoading] = useState(true);

  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [city, setCity] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listProductReviews(productId)
      .then((res) => { if (!cancelled) setReviews(res.reviews); })
      .catch(() => { if (!cancelled) setReviews([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [productId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (rating < 1) { setError('Please choose a star rating.'); return; }
    if (title.trim().length < 3) { setError('Please give your review a short title.'); return; }
    if (body.trim().length < 10) { setError('Reviews need to be at least 10 characters.'); return; }

    const token = typeof window === 'undefined' ? null : localStorage.getItem('google_auth_token');
    if (!token) { setError('Please sign in to leave a review.'); return; }

    try {
      setSubmitting(true);
      const res = await submitProductReview(
        { productId, rating, title: title.trim(), body: body.trim(), city: city.trim() || undefined },
        token,
      );
      setSuccess(res.message);
      setRating(0); setTitle(''); setBody(''); setCity('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit your review. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section style={{ marginTop: 'var(--sp-12)' }} aria-labelledby="reviews-heading">
      <div className="section-header" style={{ marginBottom: 'var(--sp-6)' }}>
        <span className="eyebrow">Reviews</span>
        <h2 id="reviews-heading">
          What customers think of <span style={{ background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>{productName}</span>
        </h2>
      </div>

      {/* Approved reviews list */}
      {loading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>Loading reviews…</div>
      ) : reviews.length === 0 ? (
        <div className="card" style={{ padding: 'var(--sp-5)', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem' }}>
            No reviews yet. Be the first to share your experience with this piece.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
          {reviews.map((r) => (
            <article key={r.id} className="card" style={{ padding: 'var(--sp-4)' }}>
              <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--sp-3)', marginBottom: 'var(--sp-2)' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
                    <strong style={{ color: 'var(--text-primary)' }}>{r.author}</strong>
                    {r.verified && (
                      <span className="badge badge-green" style={{ fontSize: '0.62rem' }}>✓ Verified buyer</span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {[r.city, new Date(r.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <Stars value={r.rating} size="0.95rem" />
              </header>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 'var(--sp-1)' }}>{r.title}</h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{r.body}</p>
            </article>
          ))}
        </div>
      )}

      {/* Submission form */}
      <div className="card" style={{ marginTop: 'var(--sp-6)', padding: 'var(--sp-5)' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 'var(--sp-2)' }}>Share your experience</h3>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 'var(--sp-4)' }}>
          Reviews are limited to customers who have purchased this piece, and each review is moderated before it appears here.
        </p>

        {!user ? (
          <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
            Please <Link href="/login" style={{ color: 'var(--accent-blue)' }}>sign in</Link> to leave a review.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form" noValidate>
            <label className="auth-field">
              <span className="auth-label">Your rating <em>*</em></span>
              <StarPicker value={rating} onChange={setRating} disabled={submitting} />
            </label>

            <label className="auth-field">
              <span className="auth-label">Title <em>*</em></span>
              <input
                type="text"
                required
                maxLength={120}
                placeholder="Sum up your experience in a few words"
                className="auth-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={submitting}
              />
            </label>

            <label className="auth-field">
              <span className="auth-label">Review <em>*</em></span>
              <textarea
                required
                minLength={10}
                maxLength={2000}
                placeholder="What did you love? How does it look in your space?"
                className="auth-input"
                rows={4}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                disabled={submitting}
                style={{ minHeight: 110, resize: 'vertical', lineHeight: 1.5 }}
              />
            </label>

            <label className="auth-field">
              <span className="auth-label">City <span className="auth-optional">(optional)</span></span>
              <input
                type="text"
                maxLength={80}
                placeholder="e.g. Bengaluru"
                className="auth-input"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                disabled={submitting}
              />
            </label>

            {error && <p className="auth-error">{error}</p>}
            {success && <p className="auth-info">{success}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary btn-full pulse-glow auth-submit"
            >
              {submitting ? 'Submitting…' : 'Submit review'}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
