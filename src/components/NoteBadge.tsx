import { useState } from 'react';
import { Info } from 'lucide-react';
import { AnchoredMenu } from './AnchoredMenu';

// Small info badge: shown only when an item has notes. Hover shows the native
// tooltip (no flicker); click opens a richer popover with the full text.
export function NoteBadge({ notes }: { notes: string }) {
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        draggable={false}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          setMenuAnchor(menuAnchor ? null : e.currentTarget.getBoundingClientRect());
        }}
        className="p-0.5 rounded text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-help"
        title={notes}
      >
        <Info className="w-3.5 h-3.5" />
      </button>

      {menuAnchor && (
        <AnchoredMenu anchor={menuAnchor} align="left" className="p-2" onClose={() => setMenuAnchor(null)}>
          <p className="max-w-[220px] whitespace-pre-wrap break-words text-xs text-zinc-700 dark:text-zinc-300">
            {notes}
          </p>
        </AnchoredMenu>
      )}
    </div>
  );
}
