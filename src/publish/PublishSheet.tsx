import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type BackupInfo, type PublishPlanInfo, type PublishRun } from "../lib/api.ts";
import { plural, timeAgo } from "../lib/format.ts";
import { Icon } from "../ui/icons.tsx";
import { Sheet } from "../cms/SettingsSheet.tsx";

const FIELD: Record<string, string> = {
  page: "page",
  studio: "credits or soundtrack",
  cover: "cover",
  title: "title",
  summary: "summary",
  description: "description",
  category: "category",
  year: "year",
  role: "role",
  tools: "tools",
  gallery: "gallery",
  featured: "featured",
  accent: "accent colour",
  blocks: "old Studio blocks",
};
const mb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** The Publish button with how many projects would change. Click to open the sheet. */
export function PublishButton({ beforeOpen }: { beforeOpen?: () => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<number | null>(null);
  const refresh = useCallback(() => {
    api.publishPlan().then((p) => setPending(p.pending), () => setPending(null));
  }, []);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, [refresh]);
  return (
    <>
      <button
        type="button"
        className="btn btn-sm publish-btn"
        title="Publish to the site"
        onClick={async () => {
          await beforeOpen?.();
          setOpen(true);
        }}
      >
        <Icon name="upload" size={14} />
        Publish
        {pending ? <span className="publish-count tabular">{pending}</span> : null}
      </button>
      {open && (
        <PublishSheet
          onClose={() => {
            setOpen(false);
            refresh();
          }}
        />
      )}
    </>
  );
}

/**
 * What publishing would change on the site, project by project, the media it
 * copies and anything to fix first. Publishing writes exactly this (after a
 * backup). The History tab lists every backup with one-click restore.
 */
export function PublishSheet({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"publish" | "history">("publish");
  const [plan, setPlan] = useState<PublishPlanInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<PublishRun | null>(null);
  // Projects left out of this publish (their site version stays). Empty = publish everything.
  const [held, setHeld] = useState<ReadonlySet<string>>(() => new Set());
  const [all, setAll] = useState<string[]>([]);
  const only = held.size ? all.filter((s) => !held.has(s)) : undefined;
  const onlyKey = only?.join(",");

  const load = useCallback(() => {
    setError(null);
    const list = onlyKey === undefined ? undefined : onlyKey ? onlyKey.split(",") : [];
    api.publishPlan(list).then(
      (p) => {
        setPlan(p);
        if (!list) setAll(p.changes.filter(isPending).map((c) => c.slug));
      },
      (e: Error) => setError(e.message),
    );
  }, [onlyKey]);
  useEffect(load, [load]);

  const toggle = (slug: string) =>
    setHeld((prev) => {
      const next = new Set(prev);
      if (!next.delete(slug)) next.add(slug);
      return next;
    });

  const go = async () => {
    if (!plan) return;
    setBusy(true);
    setError(null);
    try {
      setDone(await api.publish(plan.hash, only));
      setHeld(new Set());
      load();
    } catch (e) {
      const err = e as ApiError;
      setError(err.message);
      if (err.status === 409 && err.body.plan) setPlan(err.body.plan as unknown as PublishPlanInfo);
    } finally {
      setBusy(false);
    }
  };

  const groups = plan
    ? {
        added: plan.changes.filter((c) => c.kind === "added"),
        changed: plan.changes.filter((c) => c.kind === "changed"),
        removed: plan.changes.filter((c) => c.kind === "removed"),
        unchanged: plan.changes.filter((c) => c.kind === "unchanged"),
        kept: plan.changes.filter((c) => c.kind === "kept"),
      }
    : null;
  const toCopy = plan?.media.filter((m) => !m.present && !m.missing) ?? [];
  const pick = all.length > 1 ? { held, toggle } : undefined;
  const errors = plan?.warnings.filter((w) => w.level === "error") ?? [];
  const warns = plan?.warnings.filter((w) => w.level === "warn") ?? [];

  return (
    <Sheet title="Publish to the site" kicker="Website" onClose={onClose}>
      <div className="segmented seg-fill publish-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "publish"} aria-pressed={tab === "publish"} onClick={() => setTab("publish")}>
          Publish
        </button>
        <button type="button" role="tab" aria-selected={tab === "history"} aria-pressed={tab === "history"} onClick={() => setTab("history")}>
          History and restore
        </button>
      </div>

      {tab === "history" ? (
        <History onRestored={load} />
      ) : (
        <div className="publish-body">
          {error && (
            <p className="sheet-error" role="alert">
              {error}
            </p>
          )}
          {done && (
            <div className="publish-done" role="status">
              <Icon name="check" />
              <div>
                <strong>Published.</strong>
                <p>
                  {[done.added?.length && `${plural(done.added.length, "project")} added`, done.changed?.length && `${done.changed.length} updated`, done.removed?.length && `${done.removed.length} taken off`]
                    .filter(Boolean)
                    .join(", ") || "Nothing changed"}
                  {done.media ? ` · ${plural(done.media, "file")} copied` : ""}. The previous version is saved as backup {done.backup}.
                </p>
              </div>
            </div>
          )}
          {!plan && !error && <p className="muted sheet-loading">Comparing with the site…</p>}
          {plan && groups && (
            <>
              <p className="publish-target muted">
                Writes <code>data/projects.json</code> in <span title={plan.site.dir}>{plan.site.dir.split(/[\\/]/).pop()}</span>, after backing up the current file.
              </p>

              {errors.length > 0 && (
                <section className="publish-group" data-tone="error">
                  <h3>Fix before publishing</h3>
                  <ul role="list">
                    {errors.map((w, i) => (
                      <li key={i}>
                        <strong>{w.title}</strong> {w.text}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {plan.pending === 0 && toCopy.length === 0 && !held.size ? (
                <p className="publish-none">The site is up to date. Nothing to publish.</p>
              ) : (
                <>
                  {pick && <p className="publish-pick-hint muted">Untick a project to leave its site version as it is this time.</p>}
                  <Group title="New on the site" items={groups.added} pick={pick} />
                  <Group title="Updated" items={groups.changed} detail={(c) => `Changed: ${c.fields.map((f) => FIELD[f] ?? f).join(", ")}`} pick={pick} />
                  <Group title="Taken off the site" items={groups.removed} detail={(c) => c.why ?? ""} tone="warn" pick={pick} />
                  {toCopy.length > 0 && (
                    <section className="publish-group">
                      <h3>
                        Media to copy · {plural(toCopy.length, "file")} · {mb(toCopy.reduce((n, m) => n + m.size, 0))}
                      </h3>
                      <details>
                        <summary>Show files</summary>
                        <ul role="list" className="publish-files">
                          {toCopy.map((m) => (
                            <li key={m.from}>
                              <code>{m.to}</code> <span className="muted">{mb(m.size)}</span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    </section>
                  )}
                </>
              )}

              {warns.length > 0 && (
                <section className="publish-group" data-tone="warn">
                  <h3>Worth a look (won't stop publishing)</h3>
                  <ul role="list">
                    {warns.map((w, i) => (
                      <li key={i}>
                        <strong>{w.title}</strong> {w.text}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {(groups.unchanged.length > 0 || groups.kept.length > 0) && (
                <p className="muted publish-same">
                  {groups.unchanged.length > 0 && `${plural(groups.unchanged.length, "project")} already up to date. `}
                  {groups.kept.length > 0 && `${plural(groups.kept.length, "project")} only on the site, left as they are.`}
                </p>
              )}

              <footer className="publish-foot">
                <button type="button" className="btn btn-ghost" onClick={onClose}>
                  Close
                </button>
                <button type="button" className="btn btn-primary" disabled={busy || plan.blocked || (plan.pending === 0 && toCopy.length === 0)} onClick={() => void go()}>
                  {busy ? "Publishing…" : held.size ? `Publish ${plan.pending} of ${plural(all.length, "change")}` : `Publish ${plural(plan.pending, "change")}`}
                </button>
              </footer>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}

type Change = PublishPlanInfo["changes"][number];
const isPending = (c: Change) => c.kind === "added" || c.kind === "changed" || c.kind === "removed";

function Group({ title, items, detail, tone, pick }: { title: string; items: Change[]; detail?: (c: Change) => string; tone?: string; pick?: { held: ReadonlySet<string>; toggle: (slug: string) => void } }) {
  if (!items.length) return null;
  const going = pick ? items.filter((c) => !pick.held.has(c.slug)).length : items.length;
  return (
    <section className="publish-group" data-tone={tone}>
      <h3>
        {title} · {going === items.length ? items.length : `${going} of ${items.length}`}
      </h3>
      <ul role="list">
        {items.map((c) => {
          const label = (
            <>
              <strong>{c.title}</strong> <span className="muted">/work/{c.slug}</span>
              {detail && <p className="muted">{detail(c)}</p>}
            </>
          );
          return (
            <li key={c.slug} data-held={pick?.held.has(c.slug) || undefined}>
              {pick ? (
                <label className="publish-pick">
                  <input type="checkbox" checked={!pick.held.has(c.slug)} onChange={() => pick.toggle(c.slug)} />
                  <span>{label}</span>
                </label>
              ) : (
                label
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Every backup of the site's projects file, newest first, each one restorable. */
function History({ onRestored }: { onRestored: () => void }) {
  const [backups, setBackups] = useState<BackupInfo[] | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(() => {
    api.backups().then(setBackups, () => setBackups([]));
  }, []);
  useEffect(load, [load]);
  const restore = async (id: string) => {
    try {
      const r = await api.restoreBackup(id);
      setMsg(`Restored. What was there is saved as backup ${r.backup}, so this can be undone the same way.`);
      setConfirm(null);
      load();
      onRestored();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  if (!backups) return <p className="muted sheet-loading">Loading…</p>;
  return (
    <div className="publish-body">
      {msg && (
        <p className="publish-done" role="status">
          {msg}
        </p>
      )}
      {!backups.length && <p className="publish-none">No backups yet. One is made before every publish.</p>}
      <ul role="list" className="backup-list">
        {backups.map((b) => (
          <li key={b.id}>
            <div>
              <strong>{b.reason}</strong>
              <span className="muted">
                {timeAgo(b.at)} · {mb(b.size)}
                {b.changes.length ? ` · then ${b.changes.map((c) => `${c.kind} ${c.title}`).slice(0, 3).join(", ")}${b.changes.length > 3 ? "…" : ""}` : ""}
              </span>
            </div>
            {confirm === b.id ? (
              <span className="version-confirm">
                <button type="button" className="btn btn-sm btn-primary" onClick={() => void restore(b.id)}>
                  Restore this
                </button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirm(null)}>
                  Cancel
                </button>
              </span>
            ) : (
              <button type="button" className="btn btn-sm" onClick={() => setConfirm(b.id)} title="Put the site's projects file back to this version (the current one is backed up first)">
                Restore
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
