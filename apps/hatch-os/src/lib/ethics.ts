import { deleteRecord, readRecords, saveRecord } from "./beta-store.ts";
import { normalizeEthics, type EthicsProfile } from "./ethics-profile.ts";
import { safeCode } from "./testers.ts";

export * from "./ethics-profile.ts";

function scopeKey(scope: string) {
  return safeCode(scope || "staff") || "staff";
}

export async function loadEthics(scope: string, agentId?: string): Promise<EthicsProfile> {
  const key = scopeKey(scope);
  const rows = await readRecords<EthicsProfile & { id?: string }>(`ethics/${key}`);
  const workspace = normalizeEthics(rows.find((row) => row.id === "workspace") || null);
  if (!agentId) return workspace;
  const agent = rows.find((row) => row.id === `agent-${agentId}`);
  if (!agent || agent.inherit !== false) return { ...workspace, inherit: true };
  return normalizeEthics({ ...agent, inherit: false });
}

export async function saveEthics(scope: string, profile: EthicsProfile, agentId?: string) {
  const key = scopeKey(scope);
  const id = agentId ? `agent-${agentId}` : "workspace";
  await saveRecord(`ethics/${key}`, id, { ...normalizeEthics(profile), id });
}

export async function resetEthics(scope: string, agentId?: string) {
  const key = scopeKey(scope);
  const id = agentId ? `agent-${agentId}` : "workspace";
  await deleteRecord(`ethics/${key}`, id);
}
