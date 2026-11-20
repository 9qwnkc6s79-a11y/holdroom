/** Geometric monogram. No mascot, no character. */
export function BlobAvatar({
  color,
  size = 48,
  badge,
  label,
}: {
  color: string;
  size?: number;
  badge?: boolean;
  label?: string;
}) {
  const letters = (label || "")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span className="blob" style={{ width: size, height: size, background: color, fontSize: Math.max(11, size * 0.34) }}>
      {letters || (
        <svg viewBox="0 0 24 24" width={size * 0.46} height={size * 0.46} aria-hidden="true">
          <path d="M4 4h6v6H4V4zm10 0h6v6h-6V4zM4 14h6v6H4v-6zm10 0h6v6h-6v-6z" fill="currentColor" />
        </svg>
      )}
      {badge ? <span className="blob-badge" /> : null}
    </span>
  );
}

export function InitialAvatar({ label, size = 36 }: { label: string; size?: number }) {
  const letters = label
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span className="initials" style={{ width: size, height: size, fontSize: size * 0.34 }}>
      {letters || "H"}
    </span>
  );
}
