import {
  ArrowUp,
  AudioLines,
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  File,
  Flag,
  Folder,
  Image,
  LayoutGrid,
  Menu,
  MessageSquare,
  Mic,
  MoreHorizontal,
  Paperclip,
  Plus,
  Scan,
  Settings,
  X,
  type LucideIcon,
} from "lucide-react";

/** Every toolbar glyph is a 24-grid Lucide icon at the same 1.5 stroke. */
function Glyph({ icon: Icon, size = 18 }: { icon: LucideIcon; size?: number }) {
  return <Icon className="hatch-icon" size={size} strokeWidth={1.5} absoluteStrokeWidth={false} aria-hidden="true" />;
}

export function IconX({ size = 18 }: { size?: number }) {
  return <Glyph icon={X} size={size} />;
}
export function IconChevronLeft({ size = 18 }: { size?: number }) {
  return <Glyph icon={ChevronLeft} size={size} />;
}
export function IconChevronRight({ size = 18 }: { size?: number }) {
  return <Glyph icon={ChevronRight} size={size} />;
}
export function IconChevronDown({ size = 16 }: { size?: number }) {
  return <Glyph icon={ChevronDown} size={size} />;
}
export function IconPlus({ size = 18 }: { size?: number }) {
  return <Glyph icon={Plus} size={size} />;
}
export function IconDots({ size = 18 }: { size?: number }) {
  return <Glyph icon={MoreHorizontal} size={size} />;
}
export function IconArrowUp({ size = 18 }: { size?: number }) {
  return <Glyph icon={ArrowUp} size={size} />;
}
export function IconFlag({ size = 18 }: { size?: number }) {
  return <Glyph icon={Flag} size={size} />;
}
export function IconGrid({ size = 18 }: { size?: number }) {
  return <Glyph icon={LayoutGrid} size={size} />;
}
export function IconMic({ size = 18 }: { size?: number }) {
  return <Glyph icon={Mic} size={size} />;
}
export function IconWave({ size = 18 }: { size?: number }) {
  return <Glyph icon={AudioLines} size={size} />;
}
export function IconImage({ size = 18 }: { size?: number }) {
  return <Glyph icon={Image} size={size} />;
}
export function IconCamera({ size = 18 }: { size?: number }) {
  return <Glyph icon={Camera} size={size} />;
}
export function IconScan({ size = 18 }: { size?: number }) {
  return <Glyph icon={Scan} size={size} />;
}
export function IconFile({ size = 18 }: { size?: number }) {
  return <Glyph icon={File} size={size} />;
}
export function IconSettings({ size = 18 }: { size?: number }) {
  return <Glyph icon={Settings} size={size} />;
}
export function IconPaperclip({ size = 18 }: { size?: number }) {
  return <Glyph icon={Paperclip} size={size} />;
}
export function IconMenu({ size = 18 }: { size?: number }) {
  return <Glyph icon={Menu} size={size} />;
}
export function IconMessage({ size = 18 }: { size?: number }) {
  return <Glyph icon={MessageSquare} size={size} />;
}
export function IconFolder({ size = 18 }: { size?: number }) {
  return <Glyph icon={Folder} size={size} />;
}
export function IconCopy({ size = 18 }: { size?: number }) {
  return <Glyph icon={Copy} size={size} />;
}
export function IconDownload({ size = 18 }: { size?: number }) {
  return <Glyph icon={Download} size={size} />;
}
