import {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  Briefcase,
  Building2,
  Calculator,
  Calendar,
  Camera,
  ClipboardCheck,
  Clock,
  Code2,
  Compass,
  Cpu,
  Crown,
  Database,
  FileCheck,
  FlaskConical,
  FolderKanban,
  Gavel,
  Globe,
  Handshake,
  Inbox,
  KeyRound,
  Landmark,
  Layers,
  Lock,
  Mail,
  Megaphone,
  MessageSquare,
  Package,
  Palette,
  PenTool,
  Phone,
  PieChart,
  Radio,
  Receipt,
  Scale,
  ScrollText,
  Search,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  Terminal,
  TrendingUp,
  Truck,
  UserCheck,
  Users,
  Wallet,
  Workflow,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { iconForAgent } from "@/lib/bot-icons";

const ICONS: Record<string, LucideIcon> = {
  briefcase: Briefcase,
  compass: Compass,
  target: Target,
  crown: Crown,
  shield: Shield,
  sparkles: Sparkles,
  "building-2": Building2,
  layers: Layers,
  "sliders-horizontal": SlidersHorizontal,
  wrench: Wrench,
  package: Package,
  truck: Truck,
  "clipboard-check": ClipboardCheck,
  workflow: Workflow,
  activity: Activity,
  scale: Scale,
  gavel: Gavel,
  "shield-check": ShieldCheck,
  "file-check": FileCheck,
  lock: Lock,
  "scroll-text": ScrollText,
  landmark: Landmark,
  "trending-up": TrendingUp,
  calculator: Calculator,
  receipt: Receipt,
  "pie-chart": PieChart,
  wallet: Wallet,
  megaphone: Megaphone,
  "pen-tool": PenTool,
  palette: Palette,
  globe: Globe,
  radio: Radio,
  camera: Camera,
  handshake: Handshake,
  users: Users,
  phone: Phone,
  mail: Mail,
  calendar: Calendar,
  "message-square": MessageSquare,
  search: Search,
  "book-open": BookOpen,
  "bar-chart-3": BarChart3,
  terminal: Terminal,
  "code-2": Code2,
  database: Database,
  cpu: Cpu,
  "flask-conical": FlaskConical,
  "user-check": UserCheck,
  "folder-kanban": FolderKanban,
  inbox: Inbox,
  "key-round": KeyRound,
  clock: Clock,
  bell: Bell,
};

function HatchMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 8H7v2M15 8h2v2M9 16H7v-2M15 16h2v-2" />
    </svg>
  );
}

export function AgentAvatar({
  label,
  icon,
  size = 48,
  live = false,
}: {
  label: string;
  icon?: string | null;
  size?: number;
  live?: boolean;
}) {
  const id = iconForAgent({ name: label, icon });
  const glyph = Math.max(14, Math.round(size * 0.46));
  const Mark = id === "brackets" ? null : ICONS[id];
  return (
    <span className="blob agent-avatar" style={{ width: size, height: size }} aria-hidden="true">
      {id === "brackets" || !Mark ? <HatchMark size={glyph} /> : <Mark size={glyph} strokeWidth={1.5} aria-hidden="true" />}
      {live ? <span className="blob-badge" /> : null}
    </span>
  );
}

export function BlobAvatar({
  label,
  icon,
  size = 48,
  badge,
}: {
  color?: string;
  size?: number;
  badge?: boolean;
  label?: string;
  icon?: string | null;
}) {
  return <AgentAvatar label={label || "Hatch"} icon={icon} size={size} live={Boolean(badge)} />;
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
