interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Distance {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Page px. */
  value: number;
}

/**
 * Red distance lines between the selection `a` and another box `b`, in screen
 * px, labelled in page px. Inside each other: the four insets. Apart: the gap
 * on each axis where they don't overlap.
 */
export function distances(a: Rect, b: Rect, zoom: number): Distance[] {
  const out: Distance[] = [];
  const ar = a.x + a.w;
  const ab = a.y + a.h;
  const br = b.x + b.w;
  const bb = b.y + b.h;
  const cy = a.y + a.h / 2;
  const cx = a.x + a.w / 2;
  const add = (x1: number, y1: number, x2: number, y2: number) => {
    const value = Math.round(Math.hypot(x2 - x1, y2 - y1) / zoom);
    if (value > 0) out.push({ x1, y1, x2, y2, value });
  };
  const inside = (o: Rect, i: Rect) => i.x >= o.x - 0.5 && i.y >= o.y - 0.5 && i.x + i.w <= o.x + o.w + 0.5 && i.y + i.h <= o.y + o.h + 0.5;

  if (inside(b, a) || inside(a, b)) {
    const [o, i] = inside(b, a) ? [b, a] : [a, b];
    const icx = i.x + i.w / 2;
    const icy = i.y + i.h / 2;
    add(o.x, icy, i.x, icy);
    add(i.x + i.w, icy, o.x + o.w, icy);
    add(icx, o.y, icx, i.y);
    add(icx, i.y + i.h, icx, o.y + o.h);
    return out;
  }
  // Horizontal gap, drawn through the middle of the vertical overlap (or a's middle).
  const oy = Math.max(a.y, b.y) < Math.min(ab, bb) ? (Math.max(a.y, b.y) + Math.min(ab, bb)) / 2 : cy;
  if (b.x >= ar) add(ar, oy, b.x, oy);
  else if (br <= a.x) add(br, oy, a.x, oy);
  const ox = Math.max(a.x, b.x) < Math.min(ar, br) ? (Math.max(a.x, b.x) + Math.min(ar, br)) / 2 : cx;
  if (b.y >= ab) add(ox, ab, ox, b.y);
  else if (bb <= a.y) add(ox, bb, ox, a.y);
  return out;
}

export function MeasureLines({ items, target }: { items: Distance[]; target: Rect }) {
  return (
    <>
      <div className="ms-target" style={{ left: target.x, top: target.y, width: target.w, height: target.h }} />
      {items.map((d, i) => {
        const vertical = d.x1 === d.x2;
        return (
          <div
            key={i}
            className="ms-line"
            data-vertical={vertical || undefined}
            style={vertical ? { left: d.x1, top: Math.min(d.y1, d.y2), height: Math.abs(d.y2 - d.y1) } : { top: d.y1, left: Math.min(d.x1, d.x2), width: Math.abs(d.x2 - d.x1) }}
          >
            <span>{d.value}</span>
          </div>
        );
      })}
    </>
  );
}
