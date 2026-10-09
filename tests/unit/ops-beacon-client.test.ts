import { describe, expect, it, vi } from "vitest";

import { BEACON_ID_PATTERN } from "@/lib/ops/beacon";
import { mintBeaconId, OPS_BEACON_PATH, postOpsBeacon } from "@/lib/validation/ops-beacon-client";

/**
 * The client half of the retry-exhaustion beacon.
 *
 * Two claims: the minted id always satisfies the server's shape guard (a mint the route
 * answers 400 to would silently drop every episode), and the POST carries nothing but the
 * nonce and never throws. The shape is asserted against the REAL server pattern imported
 * above, not a copy — a divergence fails here rather than in production.
 */

describe("mintBeaconId", () => {
  it("mints a 22-character base64url id satisfying the server pattern", () => {
    const id = mintBeaconId(
      new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]),
    );
    expect(id).toHaveLength(22);
    expect(id).toMatch(BEACON_ID_PATTERN);
  });

  it("mints distinct ids for distinct material", () => {
    expect(mintBeaconId(new Uint8Array(16).fill(1))).not.toBe(
      mintBeaconId(new Uint8Array(16).fill(2)),
    );
  });

  it("mints without injected bytes via the platform randomness", () => {
    const first = mintBeaconId();
    const second = mintBeaconId();
    expect(first).toMatch(BEACON_ID_PATTERN);
    expect(second).toMatch(BEACON_ID_PATTERN);
    expect(first).not.toBe(second);
  });
});

describe("postOpsBeacon", () => {
  it("POSTs only the nonce as JSON to the beacon path", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ status: "recorded" }), { status: 200 }),
    );
    await postOpsBeacon("AbCdefGHIJklmnOPqrstuv", fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const calls = fetchImpl.mock.calls as unknown as Array<[string, RequestInit]>;
    const [url, init] = calls[0] as [string, RequestInit];
    expect(url).toBe(OPS_BEACON_PATH);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ beaconId: "AbCdefGHIJklmnOPqrstuv" });
  });

  it("never throws when the transport refuses, and never throws on a non-ok status", async () => {
    const refusing = vi.fn(async () => {
      throw new TypeError("network down");
    });
    await expect(postOpsBeacon("AbCdefGHIJklmnOPqrstuv", refusing)).resolves.toBeUndefined();

    const throwingSync = vi.fn(() => {
      throw new Error("synchronous transport failure");
    });
    await expect(
      postOpsBeacon("AbCdefGHIJklmnOPqrstuv", throwingSync as unknown as typeof fetch),
    ).resolves.toBeUndefined();

    const serverError = vi.fn(async () => new Response("no", { status: 500 }));
    await expect(postOpsBeacon("AbCdefGHIJklmnOPqrstuv", serverError)).resolves.toBeUndefined();
  });
});
