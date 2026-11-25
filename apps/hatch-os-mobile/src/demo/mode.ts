/** On-device sample assistants and one approval. Off unless EXPO_PUBLIC_HATCH_DEMO is 1 or true. */
export function demoMode(value: string | undefined = process.env.EXPO_PUBLIC_HATCH_DEMO): boolean {
  const flag = (value || "").trim().toLowerCase();
  return flag === "1" || flag === "true";
}
