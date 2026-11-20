/** One geometric agent mark. Same tile, same stroke, different glyph. */
const NAMED = {
  hatch: "brackets",
  general: "brackets",
  operations: "grid",
  ops: "grid",
  legal: "diamond",
  finance: "ring",
} as const;

const SHAPES = ["brackets", "grid", "diamond", "ring", "bars", "triangle"] as const;
type Shape = (typeof SHAPES)[number];

function shapeFor(label: string): Shape {
  const key = label.trim().toLowerCase();
  if (key in NAMED) return NAMED[key as keyof typeof NAMED];
  let hash = 0;
  for (const char of key) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  return SHAPES[hash % SHAPES.length];
}

const stroke = {
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function Glyph({ shape }: { shape: Shape }) {
  if (shape === "grid") {
    return (
      <>
        <rect x="9" y="9" width="5.5" height="5.5" rx="1" {...stroke} />
        <rect x="17.5" y="9" width="5.5" height="5.5" rx="1" {...stroke} />
        <rect x="9" y="17.5" width="5.5" height="5.5" rx="1" {...stroke} />
        <rect x="17.5" y="17.5" width="5.5" height="5.5" rx="1" {...stroke} />
      </>
    );
  }
  if (shape === "diamond") return <path d="M16 8.5 23 16 16 23.5 9 16Z" {...stroke} />;
  if (shape === "ring") return <circle cx="16" cy="16" r="6.5" {...stroke} />;
  if (shape === "bars") return <path d="M9 12h14M9 16h14M9 20h9" {...stroke} />;
  if (shape === "triangle") return <path d="M16 9.5 23 22.5H9Z" {...stroke} />;
  return <path d="M12 9.5H9.5V12M20 9.5H22.5V12M12 22.5H9.5V20M20 22.5H22.5V20" {...stroke} />;
}

export function AgentAvatar({
  label,
  size = 48,
  live = false,
}: {
  label: string;
  size?: number;
  live?: boolean;
}) {
  return (
    <span className="blob agent-avatar" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 32 32" width={Math.round(size * 0.72)} height={Math.round(size * 0.72)}>
        <Glyph shape={shapeFor(label)} />
      </svg>
      {live ? <span className="blob-badge" /> : null}
    </span>
  );
}

export function BlobAvatar({
  label,
  size = 48,
  badge,
}: {
  color?: string;
  size?: number;
  badge?: boolean;
  label?: string;
}) {
  return <AgentAvatar label={label || "Hatch"} size={size} live={Boolean(badge)} />;
}

export function InitialAvatar({ label, size = 36 }: { label: string; size?: number }) {
  const letters = label
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span className="initials" style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}>
      {letters || "H"}
    </span>
  );
}
