import { CONFIG } from "./config";

interface FloodEntry {
  timestamps: number[];
  warned: boolean;
}

const floodMap = new Map<string, FloodEntry>();

export function isFlooding(chatId: number, userId: number): boolean {
  const key = `${chatId}:${userId}`;
  const now = Date.now();
  const entry = floodMap.get(key) ?? { timestamps: [], warned: false };

  entry.timestamps = entry.timestamps.filter(
    (t) => now - t < CONFIG.FLOOD_WINDOW_MS
  );
  entry.timestamps.push(now);
  floodMap.set(key, entry);

  if (entry.timestamps.length >= CONFIG.FLOOD_LIMIT) {
    entry.timestamps = [];
    return true;
  }
  return false;
}

export function resetFlood(chatId: number, userId: number): void {
  floodMap.delete(`${chatId}:${userId}`);
}
