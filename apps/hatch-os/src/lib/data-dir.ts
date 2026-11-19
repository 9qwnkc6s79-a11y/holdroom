import path from "path";

/** Vercel can read the bundle and write only under /tmp. */
export function hatchDataDir() {
  if (process.env.HATCH_DATA_DIR) return process.env.HATCH_DATA_DIR;
  if (process.env.VERCEL) return "/tmp/hatch-os";
  return path.join(process.cwd(), "data");
}
