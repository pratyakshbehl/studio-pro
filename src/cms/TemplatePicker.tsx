import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api.ts";
import { navigate } from "../lib/router.ts";
import { Icon } from "../ui/icons.tsx";
import { SectionThumb } from "../library/SectionThumb.tsx";
import { TEMPLATES, fromTemplate } from "../library/templates.ts";

/**
 * New project: name it, pick a starting structure, go. Each card is drawn
 * from the template's real sections, so what you see is what you get.
 */
export function TemplatePicker({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [picked, setPicked] = useState("classic");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previews = useMemo(() => new Map(TEMPLATES.map((t) => [t.id, t.sections()])), []);

  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    // showModal focuses the first button (Close); the title is where typing should go.
    titleRef.current?.focus();
    return () => d?.close();
  }, []);

  const create = async () => {
    const t = TEMPLATES.find((x) => x.id === picked)!;
    setBusy(true);
    setError(null);
    try {
      const doc = await api.create(fromTemplate(t, title.trim()));
      navigate(`/p/${doc.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <dialog ref={ref} className="tpl" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()} aria-label="New project">
      <form
        className="tpl-form"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <header className="tpl-head">
          <h2>New project</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </header>
        <label className="tpl-title">
          <span>Title</span>
          <input ref={titleRef} className="input" value={title} placeholder="Client or project name, e.g. Joi Farm" onChange={(e) => setTitle(e.target.value)} />
        </label>
        <div className="tpl-grid" role="radiogroup" aria-label="Start from">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={picked === t.id}
              className="tpl-card"
              onClick={() => setPicked(t.id)}
              onDoubleClick={() => {
                setPicked(t.id);
                void create();
              }}
            >
              <span className="tpl-thumb">
                {previews.get(t.id)!.length ? <SectionThumb sections={previews.get(t.id)!} /> : <span className="tpl-blank">Blank</span>}
              </span>
              <strong>{t.label}</strong>
              <span>{t.hint}</span>
            </button>
          ))}
        </div>
        <footer className="tpl-foot">
          {error && (
            <p className="tpl-error" role="alert">
              {error}
            </p>
          )}
          <span className="muted">The words are prompts to replace; the empty boxes take your images. Double-click a template to start straight away.</span>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Creating…" : "Create project"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
