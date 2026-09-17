import type { Source } from "@/lib/types";

export function SourcesList({ sources }: { sources: Source[] }) {
  if (!sources.length) {
    return (
      <p className="fine source-empty">
        This answer did not use the library (general model knowledge). Upload a file in this room
        to ground the next ask.
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
        </details>
      ))}
    </div>
  );
}
