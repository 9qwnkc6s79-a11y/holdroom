export function operatorUiEnabled(): boolean {
  const value = (process.env.HATCH_OPERATOR_UI || "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}
