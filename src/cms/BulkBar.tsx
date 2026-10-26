import { useState } from "react";
import type { Status } from "../model/index.ts";
import { STATUS_LABEL, plural } from "../lib/format.ts";
import { Icon } from "../ui/icons.tsx";

export interface BulkActions {
  status: (s: Status) => void;
  feature: (on: boolean) => void;
  tag: (tag: string) => void;
  duplicate: () => void;
  trash: () => void;
  clear: () => void;
}

/**
 * Appears while projects are selected: change status, feature, tag,
 * duplicate or move them to the trash in one go. Trash asks twice.
 */
export function BulkBar({ count, allFeatured, busy, actions }: { count: number; allFeatured: boolean; busy: boolean; actions: BulkActions }) {
  const [tagging, setTagging] = useState(false);
  const [tag, setTag] = useState("");
  const [confirmTrash, setConfirmTrash] = useState(false);
  if (!count) return null;
  return (
    <div className="bulkbar" role="toolbar" aria-label={`${plural(count, "project")} selected`} aria-busy={busy || undefined}>
      <span className="bulkbar-count">{plural(count, "project")} selected</span>
      <span className="bar-divider" />
      <label className="bulkbar-status">
        <span className="sr-only">Set status</span>
        <select
          className="input select"
          value=""
          onChange={(e) => {
            if (e.target.value) actions.status(e.target.value as Status);
          }}
        >
          <option value="">Set status…</option>
          {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="btn btn-sm" onClick={() => actions.feature(!allFeatured)}>
        <Icon name="star" size={14} />
        {allFeatured ? "Unfeature" : "Feature"}
      </button>
      {tagging ? (
        <form
          className="bulkbar-tag"
          onSubmit={(e) => {
            e.preventDefault();
            if (tag.trim()) actions.tag(tag.trim());
            setTag("");
            setTagging(false);
          }}
        >
          <input className="input" autoFocus value={tag} placeholder="Tag to add" onChange={(e) => setTag(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setTagging(false)} />
          <button type="submit" className="btn btn-sm btn-primary">
            Add
          </button>
        </form>
      ) : (
        <button type="button" className="btn btn-sm" onClick={() => setTagging(true)}>
          <Icon name="plus" size={14} />
          Tag
        </button>
      )}
      <button type="button" className="btn btn-sm" onClick={actions.duplicate}>
        <Icon name="duplicate" size={14} />
        Duplicate
      </button>
      {confirmTrash ? (
        <button
          type="button"
          className="btn btn-sm btn-danger"
          onClick={() => {
            setConfirmTrash(false);
            actions.trash();
          }}
          onBlur={() => setConfirmTrash(false)}
          autoFocus
        >
          Move {plural(count, "project")} to the trash?
        </button>
      ) : (
        <button type="button" className="btn btn-sm" onClick={() => setConfirmTrash(true)}>
          <Icon name="trash" size={14} />
          Trash
        </button>
      )}
      <span className="bar-divider" />
      <button type="button" className="icon-btn" title="Clear selection (Esc)" aria-label="Clear selection" onClick={actions.clear}>
        <Icon name="close" />
      </button>
    </div>
  );
}
