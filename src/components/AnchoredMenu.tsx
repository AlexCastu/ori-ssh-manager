import { createPortal } from 'react-dom';

// Dropdown rendered in a portal with fixed positioning: immune to any
// overflow-y-auto / overflow-hidden container and to framer-motion stacking
// contexts (an absolute menu inside those gets clipped)
export function AnchoredMenu({
  anchor,
  align = 'right',
  onClose,
  className = 'py-1 min-w-[120px]',
  children,
}: {
  anchor: DOMRect;
  align?: 'left' | 'right';
  onClose: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  const style: React.CSSProperties = {
    // Clamp so the menu never overflows the bottom of the window
    top: Math.min(anchor.bottom + 4, window.innerHeight - 96),
  };
  if (align === 'right') {
    style.right = Math.max(8, window.innerWidth - anchor.right);
  } else {
    style.left = anchor.left;
  }

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[90]"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      />
      <div
        className={`fixed z-[95] bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg shadow-xl ${className}`}
        style={style}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </>,
    document.body
  );
}
