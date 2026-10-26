import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EditorContent, useEditor as useTiptap, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import { blockUpdate, type Block } from "../model/index.ts";
import { sanitizeHtml } from "../render/sanitize.ts";
import { Icon, type IconName } from "../ui/icons.tsx";
import { run, setTextEdit, useEditor, type TextEdit } from "./store.ts";

/**
 * Editing words on the page itself. Text blocks get a rich editor (bold,
 * italic, links, lists, highlight) with a floating toolbar; headings, quotes
 * and credits are plain text. Every change goes through the app's own undo,
 * so Ctrl+Z steps back through typing like everything else. Esc or a click
 * elsewhere finishes.
 */
export function InlineText({ block, edit }: { block: Block; edit: TextEdit }) {
  if (block.type === "text") return <RichText id={block.id} html={block.html} at={edit.at} />;
  if (block.type === "heading") return <PlainText id={block.id} field="text" value={block.text} at={edit.at} placeholder="Heading" />;
  if (block.type === "quote")
    return edit.part === "cite" ? (
      <PlainText id={block.id} field="cite" value={block.cite ?? ""} at={edit.at} placeholder="Who said it" />
    ) : (
      <PlainText id={block.id} field="text" value={block.text} at={edit.at} placeholder="A line worth quoting" multiline />
    );
  return null;
}

const finish = () => setTextEdit(null);

/** TipTap attaches its view only once <EditorContent> has mounted; until then there is none. */
function viewOf(editor: Editor) {
  try {
    return editor.isDestroyed ? null : editor.view;
  } catch {
    return null;
  }
}

/** Run `fn` as soon as the editor's view exists (a frame or two after mount). */
function whenMounted(editor: Editor, fn: (view: Editor["view"]) => void) {
  let raf = 0;
  let tries = 0;
  const tick = () => {
    const view = viewOf(editor);
    if (view) fn(view);
    else if (tries++ < 30) raf = requestAnimationFrame(tick);
  };
  tick();
  return () => cancelAnimationFrame(raf);
}

/** Put the caret where the person double-clicked, or at the end. */
function caretAt(el: HTMLElement, at?: { x: number; y: number }) {
  const sel = window.getSelection();
  if (!sel) return;
  const doc = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
  let range: Range | null = null;
  if (at && doc.caretPositionFromPoint) {
    const p = doc.caretPositionFromPoint(at.x, at.y);
    if (p && el.contains(p.offsetNode)) {
      range = document.createRange();
      range.setStart(p.offsetNode, p.offset);
    }
  } else if (at && document.caretRangeFromPoint) {
    const r = document.caretRangeFromPoint(at.x, at.y);
    if (r && el.contains(r.startContainer)) range = r;
  }
  if (!range) {
    range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

/* ── Plain text: headings, quotes, credits ────────────────────────────── */

function PlainText({ id, field, value, at, placeholder, multiline }: { id: string; field: "text" | "cite"; value: string; at?: { x: number; y: number }; placeholder: string; multiline?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const last = useRef(value);

  // Uncontrolled while typing; only an outside change (undo, the inspector) rewrites the text.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && value !== last.current) {
      el.textContent = value;
      last.current = value;
    }
  }, [value]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.textContent = value;
    el.focus({ preventScroll: true });
    caretAt(el, at);
    // Only on mount: later value changes are handled above.
  }, []);

  return (
    <span
      ref={ref}
      className="sp-editable"
      data-text-editing=""
      data-placeholder={placeholder}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      spellCheck
      role="textbox"
      aria-label={placeholder}
      aria-multiline={multiline || undefined}
      onInput={(e) => {
        // Line breaks only where they make sense; a heading stays one line.
        let text = (e.currentTarget.innerText ?? "").replace(/ /g, " ");
        if (!multiline) text = text.replace(/\n/g, " ");
        last.current = text;
        run(blockUpdate, { id, patch: { [field]: field === "cite" ? text || undefined : text } });
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" || (e.key === "Enter" && !(multiline && e.shiftKey))) {
          e.preventDefault();
          e.stopPropagation();
          finish();
        }
      }}
    />
  );
}

/* ── Rich text: text blocks ───────────────────────────────────────────── */

function RichText({ id, html, at }: { id: string; html: string; at?: { x: number; y: number } }) {
  const last = useRef(html);
  const editor = useTiptap({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        codeBlock: false,
        horizontalRule: false,
        undoRedo: false,
        dropcursor: false,
        trailingNode: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: "https", HTMLAttributes: { rel: "noopener noreferrer", target: null } },
      }),
      Highlight,
    ],
    content: sanitizeHtml(html),
    autofocus: false,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: { class: "sp-editable sp-rich", "data-text-editing": "", "aria-label": "Text", spellcheck: "true" },
      // Pasted HTML keeps only what the site can show.
      transformPastedHTML: (pasted) => sanitizeHtml(pasted),
      handleKeyDown: (_view, e) => {
        // Ctrl+K here means "link", as in every writing tool (the palette is Ctrl+K everywhere else).
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
          e.preventDefault();
          window.dispatchEvent(new Event("studio:link"));
          return true;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          finish();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      const next = sanitizeHtml(ed.isEmpty ? "" : ed.getHTML());
      if (next === last.current) return;
      last.current = next;
      run(blockUpdate, { id, patch: { html: next } });
    },
  });

  // Undo and the inspector change the html from outside; follow them without echoing back.
  useEffect(() => {
    if (!editor || html === last.current) return;
    last.current = html;
    editor.commands.setContent(sanitizeHtml(html), { emitUpdate: false });
  }, [editor, html]);

  useEffect(() => {
    if (!editor) return;
    return whenMounted(editor, (view) => {
      const pos = at ? view.posAtCoords({ left: at.x, top: at.y })?.pos : undefined;
      editor.commands.focus(pos ?? "end", { scrollIntoView: false });
    });
  }, [editor]);

  return (
    <>
      <EditorContent editor={editor} />
      {editor && <TextToolbar editor={editor} />}
    </>
  );
}

interface Tool {
  icon: IconName;
  label: string;
  keys?: string;
  active: (e: Editor) => boolean;
  run: (e: Editor) => void;
}

const TOOLS: (Tool | "|")[] = [
  { icon: "bold", label: "Bold", keys: "Ctrl B", active: (e) => e.isActive("bold"), run: (e) => e.chain().focus().toggleBold().run() },
  { icon: "italic", label: "Italic", keys: "Ctrl I", active: (e) => e.isActive("italic"), run: (e) => e.chain().focus().toggleItalic().run() },
  { icon: "underline", label: "Underline", keys: "Ctrl U", active: (e) => e.isActive("underline"), run: (e) => e.chain().focus().toggleUnderline().run() },
  { icon: "strike", label: "Strikethrough", keys: "Ctrl Shift S", active: (e) => e.isActive("strike"), run: (e) => e.chain().focus().toggleStrike().run() },
  { icon: "highlight", label: "Highlight", keys: "Ctrl Shift H", active: (e) => e.isActive("highlight"), run: (e) => e.chain().focus().toggleHighlight().run() },
  "|",
  { icon: "list", label: "Bulleted list", keys: "- space", active: (e) => e.isActive("bulletList"), run: (e) => e.chain().focus().toggleBulletList().run() },
  { icon: "list-ordered", label: "Numbered list", keys: "1. space", active: (e) => e.isActive("orderedList"), run: (e) => e.chain().focus().toggleOrderedList().run() },
  { icon: "quote", label: "Quote", keys: "> space", active: (e) => e.isActive("blockquote"), run: (e) => e.chain().focus().toggleBlockquote().run() },
  "|",
  { icon: "clear-format", label: "Clear formatting", active: () => false, run: (e) => e.chain().focus().unsetAllMarks().clearNodes().run() },
];

/**
 * Floats over the text being edited, in screen pixels (outside the zoomed
 * page), above the selection. Buttons don't steal focus from the text.
 */
function TextToolbar({ editor }: { editor: Editor }) {
  const camera = useEditor((s) => s.camera);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [linking, setLinking] = useState<string | null>(null);
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      active: TOOLS.map((t) => (t === "|" ? false : t.active(e))),
      block: e.isActive("heading", { level: 2 }) ? "h2" : e.isActive("heading", { level: 3 }) ? "h3" : e.isActive("heading", { level: 4 }) ? "h4" : "p",
      link: (e.getAttributes("link").href as string | undefined) ?? null,
      from: e.state.selection.from,
      to: e.state.selection.to,
    }),
  });

  useEffect(() => {
    const open = () => setLinking((editor.getAttributes("link").href as string | undefined) ?? "");
    window.addEventListener("studio:link", open);
    return () => window.removeEventListener("studio:link", open);
  }, [editor]);

  useLayoutEffect(() => {
    return whenMounted(editor, (view) => {
      const { from, to } = editor.state.selection;
      const a = view.coordsAtPos(from);
      const b = view.coordsAtPos(to);
      const host = view.dom.getBoundingClientRect();
      const x = Math.min(Math.max((a.left + b.right) / 2, 200), window.innerWidth - 200);
      const top = Math.min(a.top, b.top);
      // Above the selection; below the block when there's no room up top.
      const y = top - 52 > 56 ? top - 52 : Math.min(host.bottom + 10, window.innerHeight - 50);
      setPos({ x, y });
    });
  }, [editor, state.from, state.to, camera]);

  if (!pos) return null;
  const keep = (e: React.MouseEvent) => e.preventDefault();

  return createPortal(
    // Portalled to <body>, but React still bubbles its events up to the canvas: mark it as overlay UI so a click here isn't "outside".
    <div
      className="text-bar"
      style={{ left: pos.x, top: pos.y }}
      onMouseDown={keep}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      data-overlay-ui
      role="toolbar"
      aria-label="Text formatting"
    >
      {linking !== null ? (
        <form
          className="text-bar-link"
          onSubmit={(e) => {
            e.preventDefault();
            const href = linking.trim();
            const chain = editor.chain().focus().extendMarkRange("link");
            if (href) chain.setLink({ href: /^(https?:|mailto:|tel:|\/|#)/i.test(href) ? href : `https://${href}` }).run();
            else chain.unsetLink().run();
            setLinking(null);
          }}
        >
          <input
            className="input"
            autoFocus
            value={linking}
            placeholder="Paste a link, Enter to apply"
            onChange={(e) => setLinking(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                setLinking(null);
                editor.commands.focus();
              }
            }}
          />
          {state.link && (
            <button type="button" className="text-bar-btn" title="Remove link" onClick={() => (editor.chain().focus().extendMarkRange("link").unsetLink().run(), setLinking(null))}>
              <Icon name="unlink" size={15} />
            </button>
          )}
        </form>
      ) : (
        <>
          <select
            className="text-bar-select"
            aria-label="Paragraph style"
            value={state.block}
            onChange={(e) => {
              const v = e.target.value;
              const c = editor.chain().focus();
              (v === "p" ? c.setParagraph() : c.setHeading({ level: Number(v.slice(1)) as 2 | 3 | 4 })).run();
            }}
          >
            <option value="p">Paragraph</option>
            <option value="h2">Heading 2</option>
            <option value="h3">Heading 3</option>
            <option value="h4">Heading 4</option>
          </select>
          <span className="text-bar-sep" />
          {TOOLS.map((t, i) =>
            t === "|" ? (
              <span key={i} className="text-bar-sep" />
            ) : (
              <button
                key={t.label}
                type="button"
                className="text-bar-btn"
                aria-pressed={state.active[i]}
                title={t.keys ? `${t.label} (${t.keys})` : t.label}
                aria-label={t.label}
                onClick={() => t.run(editor)}
              >
                <Icon name={t.icon} size={15} />
              </button>
            ),
          )}
          <button type="button" className="text-bar-btn" aria-pressed={!!state.link} title="Link (Ctrl K)" aria-label="Link" onClick={() => setLinking(state.link ?? "")}>
            <Icon name="link" size={15} />
          </button>
          <span className="text-bar-sep" />
          <button type="button" className="text-bar-done" onClick={finish} title="Finish editing (Esc)">
            Done
          </button>
        </>
      )}
    </div>,
    document.body,
  );
}
