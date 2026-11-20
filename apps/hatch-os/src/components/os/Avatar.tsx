/** Simple hatch-shaped mark. Not a copy of anyone else's mascot. */
export function BlobAvatar({
  color,
  size = 48,
  badge,
}: {
  color: string;
  size?: number;
  badge?: boolean;
}) {
  return (
    <span className="blob" style={{ width: size, height: size }}>
      <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
        <path
          fill={color}
          d="M18 30c0-12 6-20 14-20s14 8 14 20v16c0 8-6 12-14 12s-14-4-14-12V30z"
        />
        <circle cx="26" cy="32" r="2.4" fill="#F5F1E8" />
        <circle cx="38" cy="32" r="2.4" fill="#F5F1E8" />
      </svg>
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
    <span className="initials" style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {letters || "H"}
    </span>
  );
}
