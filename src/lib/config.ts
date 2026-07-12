import { randomBytes } from "crypto";
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";

export const CONFIG_VERSION = 1;

export type FolderLock = {
  passwordHash: string;
};

export type AppConfig = {
  version: number;
  viewerPasswordHash: string;
  sessionSecret: string;
  libraryRoot: string;
  setupComplete: boolean;
  folderLocks: Record<string, FolderLock>;
  folderMasks: Record<string, string>;
};

const DATA_DIR = path.join(process.cwd(), "data");
const CONFIG_PATH = path.join(DATA_DIR, "config.json");

const BCRYPT_ROUNDS = 12;

export function getConfigPath(): string {
  return CONFIG_PATH;
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, BCRYPT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

function ensureDataDir(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function isSetupComplete(): boolean {
  const config = readConfigRaw();
  return !!config?.setupComplete;
}

function normalizeConfig(raw: AppConfig & { passwordHash?: string }): AppConfig {
  return {
    ...raw,
    viewerPasswordHash: raw.viewerPasswordHash ?? raw.passwordHash ?? "",
    folderLocks: raw.folderLocks ?? {},
    folderMasks: raw.folderMasks ?? {},
  };
}

function readConfigRaw(): AppConfig | null {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return null;
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    return normalizeConfig(JSON.parse(raw) as AppConfig);
  } catch {
    return null;
  }
}

function tryMigrateFromEnv(): AppConfig | null {
  const password = process.env.APP_PASSWORD;
  const root = process.env.LIBRARY_ROOT;
  const secret = process.env.AUTH_SECRET;
  if (!password || !root) return null;

  const config: AppConfig = {
    version: CONFIG_VERSION,
    viewerPasswordHash: hashPassword(password),
    sessionSecret: secret || randomBytes(32).toString("hex"),
    libraryRoot: path.resolve(root),
    setupComplete: true,
    folderLocks: {},
    folderMasks: {},
  };
  saveConfig(config);
  return config;
}

export function getConfig(): AppConfig | null {
  const existing = readConfigRaw();
  if (existing) return existing;
  return tryMigrateFromEnv();
}

export function requireConfig(): AppConfig {
  const config = getConfig();
  if (!config?.setupComplete) {
    throw new Error("Setup not complete");
  }
  return config;
}

export function saveConfig(config: AppConfig): void {
  ensureDataDir();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), {
    mode: 0o600,
  });
}

export function createInitialConfig(
  password: string,
  libraryRoot: string
): AppConfig {
  return {
    version: CONFIG_VERSION,
    viewerPasswordHash: hashPassword(password),
    sessionSecret: randomBytes(32).toString("hex"),
    libraryRoot: path.resolve(libraryRoot),
    setupComplete: true,
    folderLocks: {},
    folderMasks: {},
  };
}

export function getLibraryRoot(): string {
  const config = getConfig();
  if (config?.libraryRoot) return config.libraryRoot;
  return path.resolve(process.env.LIBRARY_ROOT || process.cwd());
}

export function getSessionSecret(): string {
  const config = requireConfig();
  return config.sessionSecret;
}

export function updateViewerPassword(
  currentPassword: string,
  newPassword: string
): boolean {
  const config = requireConfig();
  if (!verifyPassword(currentPassword, config.viewerPasswordHash)) return false;
  config.viewerPasswordHash = hashPassword(newPassword);
  saveConfig(config);
  return true;
}

export function updateLibraryRoot(libraryRoot: string): void {
  const config = requireConfig();
  config.libraryRoot = path.resolve(libraryRoot);
  saveConfig(config);
}

export function setFolderLock(
  folderId: string,
  password: string
): void {
  const config = requireConfig();
  const id = normalizeFolderId(folderId);
  if (!id) throw new Error("Invalid folder");
  config.folderLocks[id] = { passwordHash: hashPassword(password) };
  saveConfig(config);
}

export function removeFolderLock(folderId: string): void {
  const config = requireConfig();
  const id = normalizeFolderId(folderId);
  delete config.folderLocks[id];
  saveConfig(config);
}

export function getFolderLocks(): Record<string, FolderLock> {
  return requireConfig().folderLocks;
}

function normalizeFolderId(folderId: string): string {
  return folderId.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
}

export function getFolderMasks(): Record<string, string> {
  return requireConfig().folderMasks;
}

export function setFolderMask(folderId: string, displayName: string): void {
  const config = requireConfig();
  const id = normalizeFolderId(folderId);
  const name = displayName.trim();
  if (!id || !name) throw new Error("Invalid folder or display name");
  config.folderMasks[id] = name;
  saveConfig(config);
}

export function removeFolderMask(folderId: string): void {
  const config = requireConfig();
  const id = normalizeFolderId(folderId);
  delete config.folderMasks[id];
  saveConfig(config);
}
