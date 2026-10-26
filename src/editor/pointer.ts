/**
 * Pointer capture keeps a drag alive when the pointer leaves the element.
 * Browsers throw for pointers they don't track (synthetic test events, some
 * pens), and a drag should still work without capture, so failures are ignored.
 */
export function capture(el: Element, pointerId: number) {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    /* drag continues uncaptured */
  }
}
