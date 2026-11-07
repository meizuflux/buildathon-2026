let counter = 0;
export const requestId = (): string => globalThis.crypto?.randomUUID?.() ?? `haven-${Date.now()}-${++counter}-${Math.random().toString(36).slice(2)}`;
