import { useEffect, useState } from "react";
import { api, ApiError, type ImportDone, type ImportPreview } from "../lib/api.ts";
import { plural, STATUS_LABEL } from "../lib/format.ts";
import { Icon } from "../ui/icons.tsx";

const SOURCE_NAMES = {
  site: "Your website",
  studio: "Behance-style studio",
  framer: "Framer-style studio",
} as const;

const SOURCE_UNITS = { site: "project", studio: "project file", framer: "project" } as const;

function middleTruncate(path: string, keep = 2) {
  const parts = path.split(/[\\/]/);
  return parts.length <= keep + 1 ? path : `…\\${parts.slice(-keep).join("\\")}`;
}

export function ImportReport({ report, skipped }: Pick<ImportPreview, "report" | "skipped">) {
  return (
    <div className="report">
      <ul className="report-list" role="list">
        {report.map((line) => (
          <li key={line.slug + line.from.join()} className="report-line" data-existing={line.alreadyInStudio || undefined}>
            <div className="report-head">
              <span className="status" data-status={line.status}>
                {STATUS_LABEL[line.status]}
              </span>
              <strong>{line.title}</strong>
              <span className="report-slug">/{line.slug}</span>
              <span className="report-from">
                {line.from.map((f) => (
                  <span key={f} className="chip">
                    {f === "site" ? "Site" : f.replace(" studio", "")}
                  </span>
                ))}
              </span>
            </div>
            {line.alreadyInStudio ? (
              <p className="report-note">Already in Studio Pro, left as it is.</p>
            ) : (
              line.notes.map((n) => (
                <p key={n} className="report-note">
                  {n}
                </p>
              ))
            )}
          </li>
        ))}
      </ul>
      {skipped.length > 0 && (
        <details className="report-skipped">
          <summary>{plural(skipped.length, "blank draft")} left behind</summary>
          <ul role="list">
            {skipped.map((s) => (
              <li key={s.source + s.ref}>
                {s.reason}. It stays in the {s.source === "studio" ? "Behance-style" : "Framer-style"} studio ({s.ref}).
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/**
 * First run: shows where the work will come from and exactly what will happen
 * before anything is written. The preview call is read-only.
 */
export function ImportPanel({ onDone, onSkip }: { onDone: (r: ImportDone) => void; onSkip: () => void }) {
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const load = () => {
    setError(null);
    api
      .importPreview()
      .then(setPreview)
      .catch((e: ApiError) => setError(e.message));
  };
  useEffect(load, []);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      onDone(await api.importRun());
    } catch (e) {
      setError((e as Error).message);
      setRunning(false);
    }
  };

  const sources = preview ? (Object.keys(SOURCE_NAMES) as (keyof typeof SOURCE_NAMES)[]) : [];
  const nothing = preview && preview.newProjects === 0;

  return (
    <main className="onboard">
      <div className="onboard-intro">
        <h1>Bring your projects in</h1>
        <p>
          Studio Pro reads your website and both earlier studios, then makes one clean copy of each project here. It only
          copies. Nothing in those folders changes, and your site isn't touched until you publish.
        </p>
      </div>

      <section className="onboard-sources" aria-label="Where your work is">
        {!preview && !error &&
          Array.from({ length: 3 }, (_, i) => <div key={i} className="skeleton" style={{ height: 52 }} />)}
        {sources.map((key) => {
          const s = preview!.found[key];
          return (
            <div key={key} className="source" data-ok={s.ok || undefined}>
              <Icon name={key === "site" ? "globe" : "folder"} className="source-icon" />
              <div className="source-text">
                <strong>{SOURCE_NAMES[key]}</strong>
                <span title={s.path}>{middleTruncate(s.path, key === "framer" ? 3 : 2)}</span>
              </div>
              <span className="source-count tabular">{s.ok ? plural(s.count, SOURCE_UNITS[key]) : "Not found"}</span>
              {s.ok ? <Icon name="check" className="source-ok" /> : <Icon name="alert" className="source-missing" />}
            </div>
          );
        })}
      </section>

      {error && (
        <div className="callout" role="alert">
          <Icon name="alert" />
          <p>{error}</p>
          <button className="btn" onClick={preview ? run : load}>
            Try again
          </button>
        </div>
      )}

      {preview && (
        <>
          <section className="onboard-plan" aria-label="What will be imported">
            <h2>
              {nothing ? "Everything is already here" : `${plural(preview.newProjects, "project")} will be imported`}
            </h2>
            {!nothing && (
              <p className="onboard-plan-sub">
                Your site's details win wherever the studios differ.{" "}
                {preview.snapshots > 0 && (
                  <>
                    The {plural(preview.snapshots, "differing version")} {preview.snapshots === 1 ? "is" : "are"} kept as
                    snapshots you can restore.{" "}
                  </>
                )}
                {preview.media > 0 && <>{plural(preview.media, "media file")} will be copied from the Behance-style studio.</>}
              </p>
            )}
            <ImportReport report={preview.report} skipped={preview.skipped} />
          </section>

          <div className="onboard-actions">
            <button className="btn btn-primary btn-lg" onClick={run} disabled={running || !!nothing}>
              <Icon name="download" />
              {running ? "Importing…" : `Import ${plural(preview.newProjects, "project")}`}
            </button>
            <button className="btn btn-ghost btn-lg" onClick={onSkip} disabled={running}>
              Start with an empty project instead
            </button>
          </div>
        </>
      )}
    </main>
  );
}
