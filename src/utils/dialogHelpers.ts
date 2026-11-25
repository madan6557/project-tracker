export function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Configures native <dialog closedby="any"> with progressive fallback
 * for browsers lacking HTMLDialogElement.prototype.closedBy (e.g. Safari),
 * and resets dialog.returnValue on close per modern web guidance.
 */
export function wireModalDialog(dialog: HTMLDialogElement): void {
  dialog.addEventListener('close', () => {
    dialog.returnValue = '';
  });

  if (!('closedBy' in HTMLDialogElement.prototype)) {
    const isOutside = (e: PointerEvent): boolean => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    let pressedOutside = false;
    dialog.addEventListener('pointerdown', (e) => {
      pressedOutside = isOutside(e);
    });
    dialog.addEventListener('pointerup', (e) => {
      if (pressedOutside && isOutside(e)) {
        dialog.close();
      }
      pressedOutside = false;
    });
  }
}
