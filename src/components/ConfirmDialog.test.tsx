import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog busy state', () => {
  it.each([
    [undefined, 'Procesando...'],
    ['Eliminando...', 'Eliminando...'],
  ])('disables all actions with busy label %s', (busyLabel, expectedLabel) => {
    const html = renderToStaticMarkup(
      <ConfirmDialog
        open
        title="Eliminar sesión"
        description="¿Eliminar la sesión SSH guardada?"
        busy
        busyLabel={busyLabel}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(html).toContain(expectedLabel);
    expect(html.match(/<button[^>]*disabled=""/g)).toHaveLength(3);
  });
});
