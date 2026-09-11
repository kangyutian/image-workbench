function text(value) {
  return String(value || "").trim();
}

export function legacyAccountId(username) {
  const value = text(username);
  return `legacy:${Buffer.from(value, "utf8").toString("base64url")}`;
}

export function ensureAccountIds(users, createAccountId) {
  const create = typeof createAccountId === "function" ? createAccountId : () => legacyAccountId("unknown");
  let changed = false;
  const normalized = (Array.isArray(users) ? users : []).map((user) => {
    if (user?.accountId) return user;
    changed = true;
    return { ...user, accountId: String(create()) };
  });
  return { users: normalized, changed };
}

export function accountIdForUsername(users, username) {
  const value = text(username);
  const exact = (Array.isArray(users) ? users : []).find((user) => text(user?.username) === value);
  const caseInsensitive = exact || (Array.isArray(users) ? users : []).find((user) => text(user?.username).toLowerCase() === value.toLowerCase());
  return caseInsensitive?.accountId || legacyAccountId(value);
}

export function migrateTaskAccountId(task, users) {
  if (!task || task.accountId || !task.owner) return task;
  return { ...task, accountId: accountIdForUsername(users, task.owner) };
}

export function resolveSessionUser(session, users) {
  if (!session?.accountId || !session?.username || !session?.role) return null;
  return (Array.isArray(users) ? users : []).find((user) => user.accountId === session.accountId && user.username === session.username && user.role === session.role) || null;
}
