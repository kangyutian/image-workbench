export function adminUsageStatus(user) {
  if (!user) return 401;
  return user.role === "admin" ? 200 : 403;
}

export function usageResponse(usage) {
  return { usage };
}
