import fs from "fs";
import { CONFIG } from "./config";
import { logger } from "../lib/logger";

export interface UserData {
  invites: number;
  warnings: number;
  mutedUntil?: number;
  banned?: boolean;
  joinedAt?: number;
  username?: string;
  firstName?: string;
}

export interface Store {
  users: Record<string, UserData>;
  lastSaved: number;
}

let store: Store = { users: {}, lastSaved: Date.now() };

export function loadStore(): void {
  try {
    if (fs.existsSync(CONFIG.STORE_PATH)) {
      const raw = fs.readFileSync(CONFIG.STORE_PATH, "utf-8");
      store = JSON.parse(raw);
      logger.info({ users: Object.keys(store.users).length }, "Store loaded");
    }
  } catch (err) {
    logger.warn({ err }, "Could not load store, starting fresh");
    store = { users: {}, lastSaved: Date.now() };
  }
}

function saveStore(): void {
  try {
    store.lastSaved = Date.now();
    fs.writeFileSync(CONFIG.STORE_PATH, JSON.stringify(store, null, 2));
  } catch (err) {
    logger.warn({ err }, "Could not save store");
  }
}

export function getUser(userId: number): UserData {
  const key = String(userId);
  if (!store.users[key]) {
    store.users[key] = { invites: 0, warnings: 0 };
  }
  return store.users[key];
}

export function updateUser(userId: number, data: Partial<UserData>): UserData {
  const key = String(userId);
  const user = getUser(userId);
  Object.assign(user, data);
  store.users[key] = user;
  saveStore();
  return user;
}

export function addInvites(userId: number, count: number): UserData {
  const user = getUser(userId);
  return updateUser(userId, { invites: user.invites + count });
}

export function addWarning(userId: number): UserData {
  const user = getUser(userId);
  return updateUser(userId, { warnings: user.warnings + 1 });
}

export function resetWarnings(userId: number): UserData {
  return updateUser(userId, { warnings: 0 });
}

export function setMuted(userId: number, untilMs: number): UserData {
  return updateUser(userId, { mutedUntil: untilMs });
}

export function setBanned(userId: number, banned: boolean): UserData {
  return updateUser(userId, { banned });
}

export function getAllUsers(): Record<string, UserData> {
  return store.users;
}
