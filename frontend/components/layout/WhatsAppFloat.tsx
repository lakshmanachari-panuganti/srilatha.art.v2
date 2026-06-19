'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { waLink } from '@/lib/contact';

const HIDDEN_ON = ['/cart', '/checkout', '/login', '/admin'];
const STORAGE_KEY = 'srilatha_wa_fab_pos';
const EDGE_MARGIN = 12;
const DRAG_THRESHOLD_PX = 6;

interface Position { right: number; bottom: number }

function loadStoredPosition(): Position | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Position>;
    if (typeof parsed.right === 'number' && typeof parsed.bottom === 'number') {
      return { right: parsed.right, bottom: parsed.bottom };
    }
  } catch { /* ignore */ }
  return null;
}

export default function WhatsAppFloat() {
  const pathname = usePathname();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  // Default sits near the right-bottom corner; user-positioned values override
  // once they drag the button. The bottom default folds in env(safe-area-inset)
  // via CSS so it never collides with the mobile gesture bar.
  const [pos, setPos] = useState<Position>({ right: 16, bottom: 24 });
  const [dragging, setDragging] = useState(false);

  // Track whether the most recent interaction crossed the drag threshold so we
  // can suppress the link click that would otherwise fire on pointer-up.
  const dragMoved = useRef(false);
  const dragStart = useRef<{ x: number; y: number; startRight: number; startBottom: number } | null>(null);

  // Hydrate stored position on mount.
  useEffect(() => {
    const stored = loadStoredPosition();
    if (stored) setPos(clampToViewport(stored));
  }, []);

  // Keep the FAB visible when the viewport resizes (e.g. orientation change).
  useEffect(() => {
    const onResize = () => setPos((p) => clampToViewport(p));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!wrapperRef.current) return;
    // Only respond to the primary button / first finger.
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    wrapperRef.current.setPointerCapture(e.pointerId);
    dragStart.current = { x: e.clientX, y: e.clientY, startRight: pos.right, startBottom: pos.bottom };
    dragMoved.current = false;
    setDragging(true);
  }, [pos.right, pos.bottom]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    if (!dragMoved.current && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    dragMoved.current = true;
    // Drag mirrors movement: dragging left increases `right`, dragging up
    // increases `bottom`. Wrap with the same clamp the resize handler uses.
    setPos(clampToViewport({
      right: dragStart.current.startRight - dx,
      bottom: dragStart.current.startBottom - dy,
    }));
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (wrapperRef.current?.hasPointerCapture(e.pointerId)) {
      wrapperRef.current.releasePointerCapture(e.pointerId);
    }
    if (dragMoved.current) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pos)); } catch { /* ignore */ }
    }
    setDragging(false);
    dragStart.current = null;
  }, [pos]);

  // Cancel link navigation if the press turned into a drag.
  const onLinkClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (dragMoved.current) {
      e.preventDefault();
      // Reset so the next genuine click works.
      dragMoved.current = false;
    }
  };

  if (HIDDEN_ON.some(p => pathname === p || pathname.startsWith(`${p}/`))) return null;

  return (
    <div
      ref={wrapperRef}
      className={`whatsapp-float-wrapper ${dragging ? 'is-dragging' : ''}`}
      style={{
        right: pos.right,
        // Stack the iOS / Android home-bar inset so the FAB never clips the
        // gesture indicator on mobile devices.
        bottom: `calc(env(safe-area-inset-bottom, 0px) + ${pos.bottom}px)`,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <span className="whatsapp-pulse-ring" />
      <span className="whatsapp-pulse-ring delay" />
      <a
        href={waLink("Hi! I'm interested in your handmade art")}
        target="_blank" rel="noopener noreferrer"
        className="whatsapp-float"
        aria-label="Chat with us on WhatsApp (drag to reposition)"
        onClick={onLinkClick}
        onMouseEnter={() => setTooltipVisible(true)}
        onMouseLeave={() => setTooltipVisible(false)}
        onFocus={() => setTooltipVisible(true)}
        onBlur={() => setTooltipVisible(false)}
        draggable={false}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="white">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
        <div className={`whatsapp-tooltip ${tooltipVisible && !dragging ? 'visible' : ''}`}>
          Chat with us! 💬
        </div>
      </a>
    </div>
  );
}

// Pinned to the bottom-right edge: clamp by the FAB's bounding box (~64×64
// including the pulse rings) so the button never slips off-screen.
function clampToViewport(p: Position): Position {
  if (typeof window === 'undefined') return p;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const FAB_BOX = 64;
  return {
    right: Math.max(EDGE_MARGIN, Math.min(w - FAB_BOX - EDGE_MARGIN, p.right)),
    bottom: Math.max(EDGE_MARGIN, Math.min(h - FAB_BOX - EDGE_MARGIN, p.bottom)),
  };
}
