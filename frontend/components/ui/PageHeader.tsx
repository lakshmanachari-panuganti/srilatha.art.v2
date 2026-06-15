import Link from 'next/link';

interface Crumb {
  href: string;
  label: string;
}

interface PageHeaderProps {
  eyebrow: string;
  title: React.ReactNode;
  description?: string;
  crumbs?: Crumb[];
  currentLabel: string;
}

export default function PageHeader({ eyebrow, title, description, crumbs, currentLabel }: PageHeaderProps) {
  return (
    <div style={{ marginBottom: 'var(--sp-10)' }}>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        {(crumbs ?? []).map((c) => (
          <span key={c.href} style={{ display: 'contents' }}>
            <span className="breadcrumb-sep">›</span>
            <Link href={c.href}>{c.label}</Link>
          </span>
        ))}
        <span className="breadcrumb-sep">›</span>
        <span className="current">{currentLabel}</span>
      </nav>

      <span className="eyebrow" style={{ marginTop: 'var(--sp-6)' }}>{eyebrow}</span>
      <h1
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 'clamp(2rem,5vw,3.4rem)',
          fontWeight: 900,
          lineHeight: 1.1,
          letterSpacing: '-0.02em',
          color: 'var(--text-primary)',
          marginTop: 'var(--sp-3)',
        }}
      >
        {title}
      </h1>
      {description && (
        <p
          style={{
            color: 'var(--text-secondary)',
            fontSize: '1rem',
            lineHeight: 1.7,
            marginTop: 'var(--sp-4)',
            maxWidth: 720,
          }}
        >
          {description}
        </p>
      )}
    </div>
  );
}
