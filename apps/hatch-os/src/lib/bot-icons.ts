/** Role icons for firm agents. Ids are stable and stored on the agent. */

export interface BotIcon {
  id: string;
  label: string;
  category: string;
}

export const BOT_ICON_CATEGORIES = [
  "Core",
  "Operations",
  "Legal",
  "Finance",
  "Marketing",
  "Sales",
  "Research",
  "Admin",
] as const;

export const BOT_ICONS: BotIcon[] = [
  { id: "brackets", label: "Hatch", category: "Core" },
  { id: "briefcase", label: "Briefcase", category: "Core" },
  { id: "compass", label: "Compass", category: "Core" },
  { id: "target", label: "Target", category: "Core" },
  { id: "crown", label: "Crown", category: "Core" },
  { id: "shield", label: "Shield", category: "Core" },
  { id: "sparkles", label: "Sparkles", category: "Core" },
  { id: "building-2", label: "Building", category: "Core" },
  { id: "layers", label: "Layers", category: "Operations" },
  { id: "sliders-horizontal", label: "Sliders", category: "Operations" },
  { id: "wrench", label: "Wrench", category: "Operations" },
  { id: "package", label: "Package", category: "Operations" },
  { id: "truck", label: "Truck", category: "Operations" },
  { id: "clipboard-check", label: "Checklist", category: "Operations" },
  { id: "workflow", label: "Workflow", category: "Operations" },
  { id: "activity", label: "Activity", category: "Operations" },
  { id: "scale", label: "Scales", category: "Legal" },
  { id: "gavel", label: "Gavel", category: "Legal" },
  { id: "shield-check", label: "Shield check", category: "Legal" },
  { id: "file-check", label: "File check", category: "Legal" },
  { id: "lock", label: "Lock", category: "Legal" },
  { id: "scroll-text", label: "Scroll", category: "Legal" },
  { id: "landmark", label: "Landmark", category: "Finance" },
  { id: "trending-up", label: "Trending", category: "Finance" },
  { id: "calculator", label: "Calculator", category: "Finance" },
  { id: "receipt", label: "Receipt", category: "Finance" },
  { id: "pie-chart", label: "Pie chart", category: "Finance" },
  { id: "wallet", label: "Wallet", category: "Finance" },
  { id: "megaphone", label: "Megaphone", category: "Marketing" },
  { id: "pen-tool", label: "Pen", category: "Marketing" },
  { id: "palette", label: "Palette", category: "Marketing" },
  { id: "globe", label: "Globe", category: "Marketing" },
  { id: "radio", label: "Radio", category: "Marketing" },
  { id: "camera", label: "Camera", category: "Marketing" },
  { id: "handshake", label: "Handshake", category: "Sales" },
  { id: "users", label: "People", category: "Sales" },
  { id: "phone", label: "Phone", category: "Sales" },
  { id: "mail", label: "Mail", category: "Sales" },
  { id: "calendar", label: "Calendar", category: "Sales" },
  { id: "message-square", label: "Message", category: "Sales" },
  { id: "search", label: "Search", category: "Research" },
  { id: "book-open", label: "Book", category: "Research" },
  { id: "bar-chart-3", label: "Chart", category: "Research" },
  { id: "terminal", label: "Terminal", category: "Research" },
  { id: "code-2", label: "Code", category: "Research" },
  { id: "database", label: "Database", category: "Research" },
  { id: "cpu", label: "CPU", category: "Research" },
  { id: "flask-conical", label: "Flask", category: "Research" },
  { id: "user-check", label: "User check", category: "Admin" },
  { id: "folder-kanban", label: "Kanban", category: "Admin" },
  { id: "inbox", label: "Inbox", category: "Admin" },
  { id: "key-round", label: "Key", category: "Admin" },
  { id: "clock", label: "Clock", category: "Admin" },
  { id: "bell", label: "Bell", category: "Admin" },
];

const ICON_IDS = new Set(BOT_ICONS.map((icon) => icon.id));

const ROLE_DEFAULTS: Array<[RegExp, string]> = [
  [/\b(hatch|general)\b/, "brackets"],
  [/\b(ops|operations)\b/, "layers"],
  [/\blegal\b/, "scale"],
  [/\bfinance\b/, "trending-up"],
  [/\bmarketing\b/, "megaphone"],
  [/\b(sales|client)\b/, "handshake"],
  [/\bresearch\b/, "search"],
];

export function isBotIcon(id?: string | null): id is string {
  return Boolean(id && ICON_IDS.has(id));
}

/** Keep a stored icon. Otherwise pick the role mark, then Hatch. */
export function iconForAgent(input: { id?: string | null; name?: string | null; icon?: string | null }): string {
  if (isBotIcon(input.icon)) return input.icon;
  const key = `${input.id || ""} ${input.name || ""}`.toLowerCase();
  for (const [pattern, icon] of ROLE_DEFAULTS) {
    if (pattern.test(key)) return icon;
  }
  return "brackets";
}
