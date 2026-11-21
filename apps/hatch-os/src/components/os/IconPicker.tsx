"use client";

import { useMemo, useState } from "react";
import { AgentAvatar } from "@/components/os/Avatar";
import { BOT_ICON_CATEGORIES, BOT_ICONS } from "@/lib/bot-icons";

export function IconPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const icons = useMemo(() => {
    const q = query.trim().toLowerCase();
    return BOT_ICONS.filter((icon) => {
      if (category !== "All" && icon.category !== category) return false;
      if (!q) return true;
      return `${icon.label} ${icon.category} ${icon.id}`.toLowerCase().includes(q);
    });
  }, [category, query]);

  return (
    <div className="icon-library">
      <input
        className="connect-search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search icons"
        aria-label="Search bot icons"
      />
      <div className="icon-cats" role="tablist" aria-label="Icon categories">
        {["All", ...BOT_ICON_CATEGORIES].map((item) => (
          <button key={item} type="button" role="tab" aria-selected={category === item} className={category === item ? "is-on" : ""} onClick={() => setCategory(item)}>
            {item}
          </button>
        ))}
      </div>
      <div className="icon-grid" role="listbox" aria-label="Bot icons">
        {icons.map((icon) => (
          <button
            key={icon.id}
            type="button"
            role="option"
            aria-selected={value === icon.id}
            aria-label={icon.label}
            className={value === icon.id ? "is-on" : ""}
            onClick={() => onChange(icon.id)}
          >
            <AgentAvatar label={icon.label} icon={icon.id} size={28} />
          </button>
        ))}
        {!icons.length ? <p className="set-note">No icons match that search.</p> : null}
      </div>
    </div>
  );
}
