// 24-hour TTL: laws change slowly, and the e-Gov API responses for any given
// (endpoint, params) tuple are stable across that window. Tools that fetch
// time-sensitive views (e.g. `asof` snapshots near today) still benefit, since
// the same `asof` parameter produces the same cache key.
export const DEFAULT_CACHE_TTL_SECONDS = 86400;

export interface CacheLike {
	get(key: string): Promise<string | null>;
	put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export async function sha256Hex(input: string): Promise<string> {
	const data = new TextEncoder().encode(input);
	const digest = await crypto.subtle.digest("SHA-256", data);
	const bytes = new Uint8Array(digest);
	let hex = "";
	for (let i = 0; i < bytes.length; i++) {
		hex += bytes[i].toString(16).padStart(2, "0");
	}
	return hex;
}

export function canonicalQueryString(params: Record<string, string | number | undefined>): string {
	const entries: Array<[string, string]> = [];
	for (const [k, v] of Object.entries(params)) {
		if (v === undefined || v === null || v === "") continue;
		entries.push([k, String(v)]);
	}
	entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
	return entries.map(([k, v]) => `${k}=${v}`).join("&");
}

export async function buildCacheKey(
	endpoint: string,
	params: Record<string, string | number | undefined>,
): Promise<string> {
	const canonical = canonicalQueryString(params);
	const hash = await sha256Hex(canonical);
	return `${endpoint}:${hash}`;
}

export async function readCache<T>(cache: CacheLike | undefined, key: string): Promise<T | null> {
	if (!cache) return null;
	try {
		const raw = await cache.get(key);
		if (!raw) return null;
		return JSON.parse(raw) as T;
	} catch {
		return null;
	}
}

export async function writeCache<T>(
	cache: CacheLike | undefined,
	key: string,
	value: T,
	ttlSeconds: number = DEFAULT_CACHE_TTL_SECONDS,
): Promise<void> {
	if (!cache) return;
	try {
		await cache.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds });
	} catch {
		// Cache failures are non-fatal.
	}
}
