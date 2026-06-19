'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { listAnnouncements, PublicAnnouncement } from '@/lib/api';

export default function AnnouncementBar() {
  const [announcement, setAnnouncement] = useState<PublicAnnouncement | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    listAnnouncements()
      .then(res => { if (!cancelled) setAnnouncement(res.announcements[0] ?? null); })
      .catch(() => { if (!cancelled) setAnnouncement(null); });
    return () => { cancelled = true; };
  }, []);

  if (pathname.startsWith('/admin')) return null;
  if (!announcement || dismissed) return null;

  return (
    <div className="announcement-bar" role="banner" aria-label="Announcement">
      <span className="announcement-text">
        {announcement.message}
        {announcement.cta && announcement.link && (
          <>
            {' '}
            &nbsp;·&nbsp;
            <a href={announcement.link} className="highlight" style={{ marginLeft: 4, fontWeight: 700 }}>
              {announcement.cta} →
            </a>
          </>
        )}
        {announcement.cta && !announcement.link && (
          <>&nbsp;·&nbsp;<strong className="highlight">{announcement.cta}</strong></>
        )}
        {!announcement.cta && announcement.link && (
          <>
            {' '}
            &nbsp;·&nbsp;
            <a href={announcement.link} className="highlight" style={{ marginLeft: 4, fontWeight: 700 }}>
              Learn more →
            </a>
          </>
        )}
      </span>
      <button
        onClick={() => setDismissed(true)}
        className="announcement-close"
        aria-label="Close announcement"
      >
        ×
      </button>
    </div>
  );
}
