const cache = new Map<string, string>();

export function put(tenantId: string, userId: string, value: string): void {
  cache.set(userId, value);
}

export function get(tenantId: string, userId: string): string | undefined {
  return cache.get(userId);
}
