// Render wrappers around the icon registry. Kept in a component-only file
// (React Fast Refresh) and built with createElement so we never assign a
// dynamically-resolved component to a capitalized local during render.
import { createElement } from 'react';
import type { LucideProps } from 'lucide-react';
import { getIcon, getGroupIcon } from './icons';

export function DynamicIcon({ name, ...props }: LucideProps & { name?: string | null }) {
  return createElement(getIcon(name), props);
}

export function GroupIconView({
  name,
  isExpanded,
  ...props
}: LucideProps & { name?: string; isExpanded: boolean }) {
  return createElement(getGroupIcon(name, isExpanded), props);
}
