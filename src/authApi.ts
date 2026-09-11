export type WorkbenchRole = "admin" | "user";

export interface WorkbenchUser {
  username: string;
  role: WorkbenchRole;
  createdAt?: string;
  lastLoginAt?: string | null;
}

export interface UsageModelSummary {
  kind: "image" | "video";
  modelId: string;
  taskCount: number;
  successCount: number;
  failureCount: number;
  resultCount: number;
  amountUsd: number;
  billingPendingCount: number;
  billingFailedCount: number;
}

export interface UsageAccountSummary {
  accountId: string;
  username: string;
  status: "active" | "deleted";
  role: WorkbenchRole | null;
  taskCount: number;
  imageTaskCount: number;
  videoTaskCount: number;
  successCount: number;
  failureCount: number;
  resultCount: number;
  amountUsd: number;
  billingPendingCount: number;
  billingFailedCount: number;
  models: UsageModelSummary[];
}

export interface UsageSummary {
  trackingStartedAt: string;
  lastSyncedAt: string | null;
  pendingSyncCount: number;
  totals: Omit<UsageAccountSummary, "accountId" | "username" | "status" | "role" | "models" | "billingPendingCount" | "billingFailedCount">;
  accounts: UsageAccountSummary[];
  range?: { from: string; to: string; groupBy: "day" | "week" | "month" } | null;
  timeSeries?: Array<{ key: string; label: string; taskCount: number; imageTaskCount: number; videoTaskCount: number; successCount: number; failureCount: number; resultCount: number; amountUsd: number }>;
  sync: {
    running: boolean;
    lastStartedAt: string | null;
    lastFinishedAt: string | null;
    lastError: string | null;
    pendingSyncCount: number;
  };
}

async function request(path: string, init?: RequestInit) {
  const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.message || "Request failed.");
  return body;
}

export async function getCurrentUser(): Promise<WorkbenchUser> {
  return (await request("/auth/me")).user;
}

export async function signIn(username: string, password: string): Promise<WorkbenchUser> {
  return (await request("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) })).user;
}

export async function signOut() {
  await request("/auth/logout", { method: "POST" });
}

export async function listUsers(): Promise<WorkbenchUser[]> {
  return (await request("/admin/users")).users;
}

export async function createUser(username: string, password: string, role: WorkbenchRole): Promise<WorkbenchUser> {
  return (await request("/admin/users", { method: "POST", body: JSON.stringify({ username, password, role }) })).user;
}

export async function deleteUser(username: string) {
  await request(`/admin/users/${encodeURIComponent(username)}`, { method: "DELETE" });
}

export async function getUsageSummary(range?: { from: string; to: string; groupBy: "day" | "week" | "month" }): Promise<UsageSummary> {
  const query = range ? `?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}&groupBy=${range.groupBy}` : "";
  return (await request(`/admin/usage${query}`)).usage as UsageSummary;
}

export async function syncUsage() {
  return request("/admin/usage/sync", { method: "POST" });
}
