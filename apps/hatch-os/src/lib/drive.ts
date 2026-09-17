import type { DepartmentId } from "./types";

export const DRIVE_STUB_NOTE =
  "Google Drive OAuth is not wired. This is a connect stub — pick the sample Boundaries folder to land files in this department’s Files. Add to Library when you want Ask to cite them.";

export interface DriveStubItem {
  id: string;
  name: string;
  path: string;
  departmentHint: DepartmentId;
  text: string;
}

export const DRIVE_STUB_ITEMS: DriveStubItem[] = [
  {
    id: "drv-le-hours",
    name: "Boundaries_Drive_Little_Elm_hours.md",
    path: "Boundaries Drive / Little Elm / hours.md",
    departmentHint: "little-elm",
    text: [
      "# DEMO — Little Elm hours (Drive import stub)",
      "",
      "Label: DEMO. Imported from Google Drive stub — not a live OAuth pull.",
      "",
      "Little Elm café hours: 6:30a–6p weekdays, 7a–5p weekend.",
      "GM: Rafael. Shared voice: 940.510.8067.",
    ].join("\n"),
  },
  {
    id: "drv-hq-notes",
    name: "Boundaries_Drive_HQ_ops_notes.md",
    path: "Boundaries Drive / HQ Ops / Q3_notes.md",
    departmentHint: "hq-ops",
    text: [
      "# DEMO — HQ Ops notes (Drive import stub)",
      "",
      "Label: DEMO. Imported from Google Drive stub — not a live OAuth pull.",
      "",
      "Daniel / ops: keep store Files in Little Elm and Prosper. Do not silently edit the other store’s P&L from HQ Chat — hand off.",
    ].join("\n"),
  },
  {
    id: "drv-prosper-close",
    name: "Boundaries_Drive_Prosper_close.md",
    path: "Boundaries Drive / Prosper / close_notes.md",
    departmentHint: "prosper",
    text: [
      "# DEMO — Prosper close notes (Drive import stub)",
      "",
      "Label: DEMO. Imported from Google Drive stub — not a live OAuth pull.",
      "",
      "Prosper close: Heath confirms drawer, lobby lights, and TapMango iPad before lockup.",
    ].join("\n"),
  },
];
