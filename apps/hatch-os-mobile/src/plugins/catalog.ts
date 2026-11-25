export type PluginCategory = "Files" | "Email" | "Calendar" | "Productivity" | "Communication" | "CRM";

export type PluginAuth = "oauth" | "token" | "password" | "url" | "local" | "none";

export interface PluginDef {
  id: string;
  name: string;
  blurb: string;
  reason: string;
  category: PluginCategory;
  auth: PluginAuth;
  /** Host connector kind. Absent when the host has no route. */
  provider?: "google" | "microsoft" | "email" | "slack" | "notion" | "github" | "linear" | "mcp";
  wired: boolean;
}

export const PLUGINS: PluginDef[] = [
  { id: "gmail", name: "Gmail", blurb: "Read mail into your firm’s file room", reason: "Start with the mailbox you already use", category: "Email", auth: "oauth", provider: "google", wired: true },
  { id: "outlook", name: "Outlook", blurb: "Outlook mail, read-only", reason: "Microsoft mail, stored on your firm’s host", category: "Email", auth: "oauth", provider: "microsoft", wired: true },
  { id: "email", name: "Email", blurb: "IMAP and SMTP, including an app password", reason: "A mailbox that is not Google or Microsoft OAuth", category: "Email", auth: "password", provider: "email", wired: true },
  { id: "gdrive", name: "Google Drive", blurb: "Files you can open in Drive", reason: "Search Drive without leaving the firm", category: "Files", auth: "oauth", provider: "google", wired: true },
  { id: "onedrive", name: "OneDrive", blurb: "Files in your OneDrive", reason: "OneDrive files, read-only", category: "Files", auth: "oauth", provider: "microsoft", wired: true },
  { id: "sharepoint", name: "SharePoint", blurb: "SharePoint sites and libraries", reason: "Not on the host yet", category: "Files", auth: "none", wired: false },
  { id: "dropbox", name: "Dropbox", blurb: "Dropbox files", reason: "Not on the host yet", category: "Files", auth: "none", wired: false },
  { id: "box", name: "Box", blurb: "Box files", reason: "Not on the host yet", category: "Files", auth: "none", wired: false },
  { id: "files", name: "Files on this iPhone", blurb: "Photos and documents you attach in a chat", reason: "Already on this phone", category: "Files", auth: "local", wired: true },
  { id: "gcal", name: "Google Calendar", blurb: "Upcoming events on your primary calendar", reason: "So Hatch can see what is on your calendar", category: "Calendar", auth: "oauth", provider: "google", wired: true },
  { id: "outlook-calendar", name: "Outlook Calendar", blurb: "Events on your Microsoft calendar", reason: "The same Microsoft sign-in as Outlook mail", category: "Calendar", auth: "oauth", provider: "microsoft", wired: true },
  { id: "notion", name: "Notion", blurb: "Pages in a workspace", reason: "Notes you already keep in Notion", category: "Productivity", auth: "token", provider: "notion", wired: true },
  { id: "linear", name: "Linear", blurb: "Issues", reason: "Work tracked in Linear", category: "Productivity", auth: "token", provider: "linear", wired: true },
  { id: "github", name: "GitHub", blurb: "Repos and issues", reason: "Code and issues", category: "Productivity", auth: "token", provider: "github", wired: true },
  { id: "mcp", name: "Custom MCP", blurb: "A remote tool server", reason: "A server your firm already runs", category: "Productivity", auth: "url", provider: "mcp", wired: true },
  { id: "slack", name: "Slack", blurb: "Channels and messages", reason: "The workspace you already use", category: "Communication", auth: "token", provider: "slack", wired: true },
  { id: "teams", name: "Teams", blurb: "Microsoft Teams chats", reason: "Not on the host yet", category: "Communication", auth: "none", wired: false },
];

export const PLUGIN_CATEGORIES: ("All" | PluginCategory)[] = ["All", "Files", "Email", "Calendar", "Productivity", "Communication", "CRM"];

export const FOR_YOU = ["gmail", "gdrive", "outlook", "onedrive", "gcal"];

export function pluginById(id: string): PluginDef | undefined {
  return PLUGINS.find((plugin) => plugin.id === id);
}

export function pluginsIn(category: "All" | PluginCategory, query = ""): PluginDef[] {
  const q = query.trim().toLowerCase();
  return PLUGINS.filter((plugin) => {
    if (category !== "All" && plugin.category !== category) return false;
    if (!q) return true;
    return `${plugin.name} ${plugin.blurb} ${plugin.category}`.toLowerCase().includes(q);
  });
}

export function providerIds(provider: NonNullable<PluginDef["provider"]>): string[] {
  return PLUGINS.filter((plugin) => plugin.provider === provider).map((plugin) => plugin.id);
}
