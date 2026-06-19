import {
  Sparkles,
  Droplet,
  Disc3,
  Flower2,
  Gem,
  Gift,
  ShoppingBag,
  type LucideIcon,
} from 'lucide-react';

export interface CategoryMeta {
  id: 'all' | 'resin' | 'lippan' | 'mandala' | 'kolam' | 'wedding' | 'gifts';
  label: string;
  Icon: LucideIcon;
}

export const CATEGORY_META: CategoryMeta[] = [
  { id: 'all',     label: 'All',          Icon: ShoppingBag },
  { id: 'resin',   label: 'Resin Art',    Icon: Droplet },
  { id: 'lippan',  label: 'Lippan Art',   Icon: Sparkles },
  { id: 'mandala', label: 'Dot Mandala',  Icon: Disc3 },
  { id: 'kolam',   label: 'Kolam Art',    Icon: Flower2 },
  { id: 'wedding', label: 'Wedding Decor',Icon: Gem },
  { id: 'gifts',   label: 'Gift Sets',    Icon: Gift },
];

export const getCategoryIcon = (id: string): LucideIcon =>
  CATEGORY_META.find(c => c.id === id)?.Icon ?? ShoppingBag;

export const getCategoryLabel = (id: string): string =>
  CATEGORY_META.find(c => c.id === id)?.label ?? id;
