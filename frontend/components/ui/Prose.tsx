export default function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="prose"
      style={{
        maxWidth: 760,
        color: 'var(--text-secondary)',
        fontSize: '0.95rem',
        lineHeight: 1.8,
      }}
    >
      {children}
    </div>
  );
}
