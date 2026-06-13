// Shared icon registry for sessions and folders (groups).
// A single source of truth so the sidebar, the icon pickers and the modals
// all resolve the same names to the same lucide components.
import {
  Folder,
  FolderOpen,
  Server,
  ServerCog,
  Database,
  Cloud,
  Globe,
  Container,
  Cpu,
  HardDrive,
  Network,
  Shield,
  Lock,
  Terminal,
  Monitor,
  Box,
  Boxes,
  Layers,
  Wifi,
  GitBranch,
  Mail,
  Gauge,
  Router,
  Code,
  Key,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// Name → component. Keep 'folder' first: it is the default for groups and the
// only one with an open/closed variant (see getGroupIcon).
export const ICONS: Record<string, LucideIcon> = {
  folder: Folder,
  server: Server,
  serverCog: ServerCog,
  database: Database,
  cloud: Cloud,
  globe: Globe,
  container: Container,
  cpu: Cpu,
  hardDrive: HardDrive,
  network: Network,
  router: Router,
  wifi: Wifi,
  shield: Shield,
  lock: Lock,
  key: Key,
  terminal: Terminal,
  monitor: Monitor,
  code: Code,
  box: Box,
  boxes: Boxes,
  layers: Layers,
  gitBranch: GitBranch,
  mail: Mail,
  gauge: Gauge,
};

// Stable ordered list for the pickers.
export const ICON_NAMES: string[] = Object.keys(ICONS);

// Default icon for a session when none is chosen (used in the collapsed box).
export const DEFAULT_SESSION_ICON = 'monitor';

/** Resolve any icon name to a component, falling back to a server icon. */
export function getIcon(name?: string | null): LucideIcon {
  return (name && ICONS[name]) || Server;
}

/**
 * Resolve a group's icon. The plain 'folder' keeps the classic open/closed
 * behavior; any custom icon is shown as-is regardless of expand state.
 */
export function getGroupIcon(name: string | undefined, isExpanded: boolean): LucideIcon {
  if (!name || name === 'folder') {
    return isExpanded ? FolderOpen : Folder;
  }
  return ICONS[name] || Folder;
}
