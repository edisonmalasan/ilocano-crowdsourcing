/**
 * Client-side half of the retry-exhaustion beacon.
 *
 * CLIENT-SAFE ON PURPOSE. This module runs in the browser session (imported by the
 * validation session component), so it imports nothing server-only, no repository, and no
 * environment. The POST carries one random nonce and nothing else: no response, no batch,
 * no entry, no attempt identifier.
 *
 * Both functions never throw: the beacon is diagnostic, and a diagnostic that breaks the
 * session it instruments is worse than no diagnostic.
 */

/** Where the beacon lands. Same origin, so no credential and no CORS story. */
export const OPS_BEACON_PATH = "/api/ops-beacon";

/**
 * Mints one beacon id: 16 random bytes as base64url, 22 characters over the unreserved
 * alphabet the server's shape guard accepts.
 *
 * `source` exists so tests can pass fixed bytes without touching process-wide randomness;
 * the production path reads `crypto.getRandomValues`, falling back to `Math.random` only
 * where no cryptographic source exists (the id is a dedupe nonce, not a secret).
 */
export function mintBeaconId(source?: Uint8Array): string {
  const bytes = source ?? randomBytes(16);
  const base64 = base64Encode(bytes);
  return base64.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  try {
    const cryptoRef =
      typeof globalThis.crypto?.getRandomValues === "function" ? globalThis.crypto : null;
    if (cryptoRef !== null) {
      cryptoRef.getRandomValues(bytes);
      return bytes;
    }
  } catch {
    // Falls through to the non-cryptographic fill below.
  }
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  // `btoa` is available in every modern browser and in Node; the manual loop above keeps
  // this free of `Buffer`, which does not exist in the browser.
  return btoa(binary);
}

/**
 * POSTs one beacon and returns. Fire-and-forget by design: the caller floats the promise
 * (`void postOpsBeacon(…)`) because the queue already parked the payload — nothing the
 * server answers changes what the session shows. Transport faults, non-ok statuses, and a
 * missing fetch are all absorbed here rather than reported.
 */
export async function postOpsBeacon(
  beaconId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  try {
    await fetchImpl(OPS_BEACON_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ beaconId }),
    });
  } catch {
    // Absorbed: the retry episode is already parked and resumable; the beacon is not load-bearing.
  }
}
