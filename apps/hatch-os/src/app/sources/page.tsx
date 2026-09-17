"use client";

import Link from "next/link";
import { useHatch } from "@/components/AppProvider";
import { Shell } from "@/components/Shell";
import { SourcesList } from "@/components/SourcesList";

export default function SourcesPage() {
  const { lastSources, lastUsedLibrary } = useHatch();

  return (
    <Shell>
      <div className="panel">
        <p className="screen-kicker">Sources</p>
        {lastUsedLibrary === null ? (
          <>
            <h1>No answer yet.</h1>
            <p className="lede">Ask in this room, then open Sources from the reply.</p>
            <Link className="btn btn-dark" href="/ask">
              Back to Ask
            </Link>
          </>
        ) : !lastSources?.length ? (
          <>
            <h1>No retrieved passage.</h1>
            <p className="lede">
              This answer did not use the library (general model knowledge). Upload a file in this
              room to ground the next ask.
            </p>
            <Link className="btn btn-outline" href="/library">
              Open Library
            </Link>
          </>
        ) : (
          <>
            <h1>Passages used.</h1>
            <p className="lede">
              Phase 1: filename + snippet. The file stays on the box; this view is not a portable
              archive.
            </p>
            {lastSources.map((c) => (
              <div className="card cite" key={`${c.file}-${c.page}`}>
                <div className="cite-head">
                  <div>
                    <h2>{c.file}</h2>
                    <p className="fine">
                      {c.room}
                      {c.page ? ` · p. ${c.page}` : ""}
                    </p>
                  </div>
                </div>
                <p className="snippet">“{c.snippet}”</p>
              </div>
            ))}
            <SourcesList sources={lastSources} />
          </>
        )}
      </div>
    </Shell>
  );
}
