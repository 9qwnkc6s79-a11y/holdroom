/** Safe for the client bundle. Titles and the approval gate. */

const APPROVAL_TOOLS = new Set([
  "write_draft",
  "handoff_to_department",
  "use_vault",
  "delete_file",
  "email_send",
  "calendar_create",
  "slack_post_message",
  "notion_create_page",
  "github_create_issue",
  "linear_create_issue",
]);

export function toolNeedsApproval(name: string): boolean {
  return APPROVAL_TOOLS.has(name);
}

export function actionTitle(tool: string): string {
  switch (tool) {
    case "search_library":
      return "Searched the file room";
    case "list_files":
      return "Listed the file room";
    case "read_file":
      return "Read a file";
    case "write_draft":
      return "Drafted a memo";
    case "handoff_to_department":
      return "Sent a handoff";
    case "use_vault":
      return "Referenced a vault item";
    case "email_search":
    case "email_read":
      return "Searched mail";
    case "email_draft":
      return "Drafted an email";
    case "email_send":
      return "Sent an email";
    case "calendar_list":
      return "Checked the calendar";
    case "calendar_create":
      return "Created a calendar event";
    case "slack_post_message":
      return "Posted to Slack";
    case "notion_create_page":
      return "Created a Notion page";
    case "github_create_issue":
      return "Created a GitHub issue";
    case "linear_create_issue":
      return "Created a Linear issue";
    case "delete_file":
      return "Deleted a file";
    default:
      return "Used a tool";
  }
}
