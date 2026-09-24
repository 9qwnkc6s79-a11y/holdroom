/** Parse KEY=value lines. Does not log values (tokens live here). */
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

/** Fill empty env keys from a parsed file. Existing process env wins. */
export function applyEnvFile(text: string, env: NodeJS.ProcessEnv = process.env): string[] {
  const parsed = parseEnvFile(text);
  const applied: string[] = [];
  for (const [key, value] of Object.entries(parsed)) {
    if (env[key]) continue;
    env[key] = value;
    applied.push(key);
  }
  return applied;
}
