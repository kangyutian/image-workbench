export type WorkbenchRole = "admin" | "user";

export interface WorkbenchUser {
  username: string;
  role: WorkbenchRole;
  createdAt?: string;
  lastLoginAt?: string | null;
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
