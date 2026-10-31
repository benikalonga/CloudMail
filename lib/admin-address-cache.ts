import AsyncStorage from "@react-native-async-storage/async-storage";

import type { AdminAddress } from "./api";

/**
 * Persistent cache for the admin address list.
 *
 * It does not replace server data; it makes the addresses page behave like the inbox/sent pages:
 * 1. Show the last cached data on entry to avoid a blank screen;
 * 2. Refresh the first page in the background to sync server additions/deletions;
 * 3. Isolate by worker / query / userId so multiple Workers never mix data.
 */

const PANEL_CACHE_PREFIX = "cloudmail_admin_address_panel_cache_v1";
const INDEX_CACHE_PREFIX = "cloudmail_admin_address_index_cache_v1";
const MAX_PANEL_ADDRESSES = 240;
const MAX_INDEX_ADDRESSES = 3000;

type AdminAddressCachePayload = {
  updatedAt: string;
  count: number;
  offset: number;
  addresses: AdminAddress[];
};

export interface AdminAddressCacheEntry {
  count: number;
  offset: number;
  addresses: AdminAddress[];
}

function normalizeToken(value?: string | number | null) {
  return encodeURIComponent(String(value ?? "all").trim().toLowerCase() || "all");
}

function buildPanelCacheKey(
  workerScope?: string,
  query?: string,
  userId?: string | number | null
) {
  return [
    PANEL_CACHE_PREFIX,
    normalizeToken(workerScope || "default"),
    normalizeToken(query || "*"),
    normalizeToken(userId || "all"),
  ].join(":");
}

function buildIndexCacheKey(workerScope?: string) {
  return [INDEX_CACHE_PREFIX, normalizeToken(workerScope || "default")].join(":");
}

function sanitizeAddress(item: unknown): AdminAddress | null {
  if (!item || typeof item !== "object") return null;
  const raw = item as Partial<AdminAddress>;
  const id = Number(raw.id);
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!Number.isFinite(id) || !name) return null;
  return {
    ...raw,
    id,
    name,
  } as AdminAddress;
}

function sanitizePayload(raw: unknown): AdminAddressCacheEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const payload = raw as Partial<AdminAddressCachePayload>;
  if (!Array.isArray(payload.addresses)) return null;
  const addresses = payload.addresses
    .map(sanitizeAddress)
    .filter((item): item is AdminAddress => !!item);
  return {
    count: typeof payload.count === "number" ? payload.count : addresses.length,
    offset: typeof payload.offset === "number" ? payload.offset : addresses.length,
    addresses,
  };
}

async function readCache(key: string): Promise<AdminAddressCacheEntry | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    return sanitizePayload(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function writeCache(
  key: string,
  entry: AdminAddressCacheEntry,
  maxItems: number
) {
  const payload: AdminAddressCachePayload = {
    updatedAt: new Date().toISOString(),
    count: entry.count,
    offset: entry.offset,
    addresses: entry.addresses.slice(0, maxItems),
  };
  await AsyncStorage.setItem(key, JSON.stringify(payload));
}

export function getAdminAddressPanelCacheKey(
  workerScope?: string,
  query?: string,
  userId?: string | number | null
) {
  return buildPanelCacheKey(workerScope, query, userId);
}

export async function readAdminAddressPanelCache(params: {
  workerScope?: string;
  query?: string;
  userId?: string | number | null;
}) {
  return readCache(buildPanelCacheKey(params.workerScope, params.query, params.userId));
}

export async function writeAdminAddressPanelCache(
  params: {
    workerScope?: string;
    query?: string;
    userId?: string | number | null;
  },
  entry: AdminAddressCacheEntry
) {
  await writeCache(
    buildPanelCacheKey(params.workerScope, params.query, params.userId),
    entry,
    MAX_PANEL_ADDRESSES
  );
}

export async function clearAdminAddressPanelCache(params: {
  workerScope?: string;
  query?: string;
  userId?: string | number | null;
}) {
  await AsyncStorage.removeItem(
    buildPanelCacheKey(params.workerScope, params.query, params.userId)
  );
}

export async function readAdminAddressIndexCache(workerScope?: string) {
  return readCache(buildIndexCacheKey(workerScope));
}

export async function writeAdminAddressIndexCache(
  workerScope: string | undefined,
  entry: AdminAddressCacheEntry
) {
  await writeCache(buildIndexCacheKey(workerScope), entry, MAX_INDEX_ADDRESSES);
}
