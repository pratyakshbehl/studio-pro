import { useEffect, useRef } from "react";
import { Icon } from "../ui/icons.tsx";
import { COMMANDS, GESTURES } from "./shortcuts.ts";

/** Key caps get a <kbd>; words like "drag" or "click" stay plain. */
const KEY = /^(Ctrl|Shift|Alt|Esc|Enter|Delete|Space|Tab|[A-Z0-9]|[←→↑↓\[\];=−?+\-]|\d\.|>)$/;

const ORDER = ["Edit", "Select", "Arrange", "View", "Text", "Panels"] as const;

/** Built from the same command list the keyboard uses, so the sheet can't drift from what works. */
const GROUPS: { title: string; keys: [string, string][] }[] = ORDER.map((title) => ({
  title,
  keys: [
    ...COMMANDS.filter((c) => c.group === title && c.keys && !c.id.startsWith("arrange.nudge")).map((c): [string, string] => [c.keys!, c.label]),
    ...(title === "Arrange" ? ([["← → ↑ ↓ · Shift + arrow", "Nudge on a free canvas: 1px · 10px"]] as [string, string][]) : []),
    ...GESTURES.filter((g) => g.group === title).map((g): [string, string] => [g.keys, g.label]),
  ],
})).filter((g) => g.keys.length);

export function ShortcutSheet({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog ref={ref} className="sheet" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()} aria-label="Keyboard shortcuts">
      <header className="sheet-head">
        <h2>Keyboard shortcuts</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
          <Icon name="close" />
        </button>
      </header>
      <div className="sheet-grid">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h3>{g.title}</h3>
            <dl>
              {g.keys.map(([k, what]) => (
                <div key={k}>
                  <dt>
                    {k.split(" · ").map((part, i) => (
                      <span key={part}>
                        {i > 0 && <span className="sheet-or">or</span>}
                        {part.split(" ").map((key, j) =>
                          KEY.test(key) ? (
                            <kbd key={key + j}>{key}</kbd>
                          ) : (
                            <span key={key + j} className="sheet-word">
                              {key}
                            </span>
                          ),
                        )}
                      </span>
                    ))}
                  </dt>
                  <dd>{what}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </dialog>
  );
}
