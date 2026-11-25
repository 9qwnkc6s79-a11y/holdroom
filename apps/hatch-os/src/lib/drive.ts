import type { DepartmentId } from "./types.ts";

export const DRIVE_STUB_NOTE =
  "Google Drive is not connected. These are sample files for the firm, not a live account.";

export interface DriveStubItem {
  id: string;
  name: string;
  path: string;
  departmentHint: DepartmentId;
  text: string;
}

export const DRIVE_STUB_ITEMS: DriveStubItem[] = [
  {
    id: "drv-north-hours",
    name: "Sample_firm_north_desk_hours.md",
    path: "Sample firm Drive / North desk / hours.md",
    departmentHint: "north-desk",
    text: [
      "# Sample firm — North desk hours",
      "",
      "Sample file for the beta. Not a client record.",
      "",
      "North desk hours: weekdays and a shorter weekend.",
    ].join("\n"),
  },
  {
    id: "drv-hq-notes",
    name: "Sample_firm_Drive_operations_notes.md",
    path: "Sample firm Drive / Operations / Q3_notes.md",
    departmentHint: "hq-ops",
    text: [
      "# Sample firm — operations notes",
      "",
      "Sample file for the beta. Keep each desk’s files in that desk.",
    ].join("\n"),
  },
  {
    id: "drv-south-close",
    name: "Sample_firm_south_desk_close.md",
    path: "Sample firm Drive / South desk / close_notes.md",
    departmentHint: "south-desk",
    text: [
      "# Sample firm — South desk close",
      "",
      "Sample file for the beta. Close the desk after the checklist.",
    ].join("\n"),
  },
];
