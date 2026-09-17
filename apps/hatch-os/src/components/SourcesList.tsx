import type { Source } from "@/lib/types";

export function SourcesList({
  sources,
  onOpen,
}: {
  sources: Source[];
  onOpen?: (source: Source) => void;
}) {
  if (!sources.length) {
    return (
      <p className="fine source-empty">
        This answer did not use the library (general model knowledge). Add a file to Library to
        ground the next ask. Retrieval is firm-wide.
      </p>
    );
  }

  return (
    <div className="sources-under">
      {sources.map((source, i) => (
        <details key={`${source.file}-${i}`} className="cite-details">
          <summary>
            {source.file}
            <span className="fine">
              {source.room}
              {source.page ? ` · p. ${source.page}` : ""}
            </span>
          </summary>
          <p className="snippet">“{source.snippet}”</p>
          {onOpen ? (
            <button className="linkish" type="button" onClick={() => onOpen(source)}>
              Open in panel
            </button>
          ) : null}
        </details>
      ))}
    </div>
  );
}
