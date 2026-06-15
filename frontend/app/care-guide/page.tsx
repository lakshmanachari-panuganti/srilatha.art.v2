import type { Metadata } from 'next';
import PageHeader from '@/components/ui/PageHeader';
import Prose from '@/components/ui/Prose';

export const metadata: Metadata = {
  title: 'Care Guide',
  description: 'How to keep your handmade resin art, lippan, dot mandala and folk art looking beautiful for years.',
};

export default function CareGuidePage() {
  return (
    <div className="page-shell">
      <div className="container">
        <PageHeader eyebrow="Caring for Your Piece" title={<>Care <em style={{ fontStyle: 'normal', background: 'var(--gradient-warm)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Guide</em></>} description="Simple rules to keep every piece you own from us looking like the day it arrived." currentLabel="Care Guide" />

        <Prose>
          <h2>The general rules</h2>
          <ul>
            <li>Dust gently with a <strong>soft dry cloth</strong> or microfibre. No paper towels.</li>
            <li>Avoid <strong>direct sunlight for long periods</strong> — UV slowly yellows resin and fades pigments.</li>
            <li>Keep away from <strong>heat sources</strong> (radiators, ovens, fireplaces) — resin softens above 60°C.</li>
            <li>Never use <strong>abrasive cleaners, alcohol, or solvents</strong> like acetone. They will dull or melt the resin surface.</li>
            <li>If a piece is dusty, a damp (not wet) microfibre with a drop of mild dish soap is fine — then dry immediately.</li>
          </ul>

          <h2>Resin Art (wall pieces, geodes, ocean panels)</h2>
          <ul>
            <li>Hang on a wall away from direct afternoon sun and away from kitchens (oil splatter is hard to remove from resin).</li>
            <li>Dust every 2–3 weeks with a soft cloth.</li>
            <li>If the surface picks up a smudge, use a microfibre <em>just</em> dampened with water.</li>
          </ul>

          <h2>Resin Trays &amp; Coasters</h2>
          <ul>
            <li>Coasters: wipe with a damp cloth after use. Not dishwasher safe.</li>
            <li>Trays: hand-wash gently with mild dish soap, dry with a soft cloth. Never submerge.</li>
            <li>Hot pots and pans can mark the surface — always use a trivet for hot items.</li>
          </ul>

          <h2>Lippan Art (clay + mirror)</h2>
          <ul>
            <li>Keep <strong>completely dry</strong> — clay is porous and water will damage it.</li>
            <li>Dust by puffing with a soft brush (a clean make-up brush works well) — don&apos;t rub.</li>
            <li>Mirror pieces can be polished with a dry cotton bud occasionally.</li>
          </ul>

          <h2>Dot Mandala</h2>
          <ul>
            <li>Best displayed under glass (a simple frame works) to protect the painted dots.</li>
            <li>Don&apos;t wipe the painted surface — the dots can lift. Dust with a brush instead.</li>
          </ul>

          <h2>Kolam Canvas</h2>
          <ul>
            <li>Avoid moisture and humidity — keep out of bathrooms and unventilated rooms.</li>
            <li>Dust occasionally with a clean dry brush.</li>
          </ul>

          <h2>Wedding Decor</h2>
          <ul>
            <li>Handle by the easel/stand, not by the resin panel itself.</li>
            <li>Store upright when not on display — wrapped in a soft cloth or bubble wrap.</li>
            <li>For outdoor events: keep under shade and out of direct sun.</li>
          </ul>

          <h2>If something looks off</h2>
          <p>
            Send us a photo on WhatsApp — small surface marks can usually be polished out, and we&apos;ll talk you through it.
          </p>
        </Prose>
      </div>
    </div>
  );
}
