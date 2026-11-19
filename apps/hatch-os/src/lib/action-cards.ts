/** Safe for the client bundle. Titles and the approval gate. */

export function toolNeedsApproval(name: string): boolean {
  return name === "write_draft" || name === "handoff_to_department" || name === "use_vault" || name === "delete_file";
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
    case "delete_file":
      return "Deleted a file";
    default:
      return "Used a tool";
  }
}
