import type { ReactNode } from "react";

function Mark({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2.25, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export function IconX({ size = 16 }: { size?: number }) {
  return (
    <Mark size={size}>
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" {...stroke} />
    </Mark>
  );
}

export function IconChevronLeft({ size = 20 }: { size?: number }) {
  return (
    <Mark size={size}>
      <path d="M14.5 5.25L7.75 12l6.75 6.75" {...stroke} />
    </Mark>
  );
}

export function IconChevronRight({ size = 18 }: { size?: number }) {
  return (
    <Mark size={size}>
      <path d="M9.5 5.25L16.25 12 9.5 18.75" {...stroke} />
    </Mark>
  );
}

export function IconPlus({ size = 20 }: { size?: number }) {
  return (
    <Mark size={size}>
      <path d="M12 5.5v13M5.5 12h13" {...stroke} />
    </Mark>
  );
}

export function IconDots({ size = 18 }: { size?: number }) {
  return (
    <Mark size={size}>
      <circle cx="6" cy="12" r="1.35" fill="currentColor" />
      <circle cx="12" cy="12" r="1.35" fill="currentColor" />
      <circle cx="18" cy="12" r="1.35" fill="currentColor" />
    </Mark>
  );
}

export function IconFlag({ size = 16 }: { size?: number }) {
  return (
    <Mark size={size}>
      <path d="M7 4.5v15M7 5.5h9.5l-2 3.25 2 3.25H7" {...stroke} />
    </Mark>
  );
}
