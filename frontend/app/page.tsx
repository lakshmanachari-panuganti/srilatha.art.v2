import type { Metadata } from 'next';
import HomeClient from './HomeClient';

export const metadata: Metadata = {
  title: 'Srilatha Art — Handcrafted Resin Art, Lippan, Mandala & More',
  description: 'Premium handmade art by Srilatha — Resin Art, Lippan Art, Dot Mandala, Kolam, Wedding Decor & Gifts. Ships pan-India. Each piece poured by hand in our studio.',
  keywords: 'resin art india, handmade resin art, lippan art, dot mandala, kolam art, buy handmade art online india',
};

export default function HomePage() {
  return <HomeClient />;
}
