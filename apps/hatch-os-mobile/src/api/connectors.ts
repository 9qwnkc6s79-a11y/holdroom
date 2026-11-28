import { apiJson } from "./client";

import type { ConnectorStatus } from "./reconnect";

export interface ConnectedAccount {
  id: string;
  kind: string;
  label: string;
  detail: string;
  connectedAt?: string;
  status?: ConnectorStatus;
  missing?: string[];
}

export interface OAuthSetup {
  kind: string;
  configured: boolean;
  callbackUrl?: string;
}

export interface OAuthProbe {
  configured?: boolean;
  provider?: string;
  callbackUrl?: string;
  authorizeUrl?: string;
  message?: string;
  error?: string;
}

export function loadConnectors(_scope?: string): Promise<{ connected: ConnectedAccount[]; setup: OAuthSetup[] }> {
  return apiJson("/api/connectors");
}

export function probeOAuth(kind: string, _scope?: string): Promise<OAuthProbe> {
  const path = `/api/connectors/${encodeURIComponent(kind)}/start?client=ios&probe=1`;
  return apiJson(path);
}

export function oauthReturnUrl(): string {
  return "hatchos://oauth";
}

export function disconnectAccount(scope: string, id: string): Promise<{ ok?: boolean }> {
  return apiJson(`/api/connectors?kind=${encodeURIComponent(id)}`, {
    method: "DELETE",

  });
}

export function connectWithToken(scope: string, body: Record<string, string>): Promise<{ connector?: ConnectedAccount; error?: string }> {
  return apiJson("/api/connectors", {
    method: "POST",
    body: JSON.stringify({ ...body, scope }),
  });
}

export function syncProvider(scope: string, kind: "google" | "microsoft", departmentId: string): Promise<{ ok?: boolean; detail?: string; saved?: number; error?: string }> {
  return apiJson("/api/connectors/sync", {
    method: "POST",
    body: JSON.stringify({ scope, kind, departmentId }),
  });
}
