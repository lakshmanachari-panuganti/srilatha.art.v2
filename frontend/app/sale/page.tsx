import type { Metadata } from 'next';
import SaleClient from './SaleClient';

export const metadata: Metadata = {
  title: 'Sale',
  description: 'Limited-time discounts on handmade resin art, lippan and gift sets.',
};

export default function SalePage() {
  return <SaleClient />;
}
