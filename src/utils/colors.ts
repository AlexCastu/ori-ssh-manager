// Single source of truth for the session/folder color palette, shared by the
// sidebar and the modals (was duplicated in three places).
import type { SessionColor } from '../types';

// Tailwind classes per color for the sidebar chips/dots/borders.
export const colorConfig: Record<SessionColor, { bg: string; border: string; text: string; dot: string }> = {
  blue: { bg: 'bg-blue-500/20', border: 'border-blue-500/40', text: 'text-blue-600 dark:text-blue-400', dot: 'bg-blue-400' },
  green: { bg: 'bg-green-500/20', border: 'border-green-500/40', text: 'text-green-600 dark:text-green-400', dot: 'bg-green-400' },
  purple: { bg: 'bg-purple-500/20', border: 'border-purple-500/40', text: 'text-purple-600 dark:text-purple-400', dot: 'bg-purple-400' },
  orange: { bg: 'bg-orange-500/20', border: 'border-orange-500/40', text: 'text-orange-600 dark:text-orange-400', dot: 'bg-orange-400' },
  red: { bg: 'bg-red-500/20', border: 'border-red-500/40', text: 'text-red-600 dark:text-red-400', dot: 'bg-red-400' },
  cyan: { bg: 'bg-cyan-500/20', border: 'border-cyan-500/40', text: 'text-cyan-600 dark:text-cyan-400', dot: 'bg-cyan-400' },
  pink: { bg: 'bg-pink-500/20', border: 'border-pink-500/40', text: 'text-pink-600 dark:text-pink-400', dot: 'bg-pink-400' },
  yellow: { bg: 'bg-yellow-500/20', border: 'border-yellow-500/40', text: 'text-yellow-600 dark:text-yellow-400', dot: 'bg-yellow-400' },
};

export const COLOR_NAMES: SessionColor[] = [
  'blue', 'green', 'purple', 'orange', 'red', 'cyan', 'pink', 'yellow',
];

export const getColor = (color: SessionColor) => colorConfig[color] || colorConfig.blue;

// Swatch list (value + label + solid bg class) for the color pickers in modals.
export const SESSION_COLORS: { value: SessionColor; label: string; class: string }[] = [
  { value: 'blue', label: 'Azul', class: 'bg-blue-500' },
  { value: 'green', label: 'Verde', class: 'bg-green-500' },
  { value: 'purple', label: 'Morado', class: 'bg-purple-500' },
  { value: 'orange', label: 'Naranja', class: 'bg-orange-500' },
  { value: 'red', label: 'Rojo', class: 'bg-red-500' },
  { value: 'cyan', label: 'Cian', class: 'bg-cyan-500' },
  { value: 'pink', label: 'Rosa', class: 'bg-pink-500' },
  { value: 'yellow', label: 'Amarillo', class: 'bg-yellow-500' },
];
