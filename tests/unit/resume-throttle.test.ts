import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { type ValidatorsRepository } from "@/lib/repositories";
import {
  runResume,
  type OnboardingActionDependencies,
} from "@/lib/validators/onboarding-actions-core";
import { createPublicThrottle } from "@/lib/validators/public-throttle";

vi.mock("server-only", () => ({}));

class FakeConfigurationFailure extends Error {}

const STORED_PROFILE = {
  id: "VAL_0000abcd" as const,
  ilocanoProficiency: "fluent" as const,
  createdAt: "2026-09-30T12:00:00.000Z",
  lastActiveAt: "2026-09-30T12:00:00.000Z",
  totalValidations: 3,
};

function createHarness() {
  const calls: string[] = [];
  const validators: ValidatorsRepository = {
    create: vi.fn(async (profile) => {
      calls.push("create");
      return profile;
    }),
    findById: vi.fn(async (id: string) => {
      calls.push(`findById:${id}`);
      return id === STORED_PROFILE.id
        ? (STORED_PROFILE as Awaited<ReturnType<ValidatorsRepository["findById"]>>)
        : null;
    }),
    listByIds: vi.fn(async () => {
      calls.push("listByIds");
      return [];
    }),
    listAllIds: vi.fn(async () => {
      calls.push("listAllIds");
      return [];
    }),
    touchLastActive: vi.fn(async () => {
      calls.push("touchLastActive");
    }),
  };
  const deps: OnboardingActionDependencies = {
    validators,
    now: () => new Date("2026-09-30T12:00:00.000Z"),
    ConfigurationFailure: FakeConfigurationFailure as never,
  };
  return { deps, calls };
}

describe("a throttled resume burst is refused without learning anything", () => {
  it("refuses the 31st resume on one identity with no further lookup", async () => {
    const harness = createHarness();
    const throttle = createPublicThrottle(() => 0);

    for (let n = 0; n < 30; n += 1) {
      const result = await runResume({ storedId: "VAL_0000abcd" }, harness.deps, {
        throttle,
        originKey: "origin-a",
      });
      expect(result).toEqual({ status: "restored", validatorId: "VAL_0000abcd" });
    }
    const callsBeforeRefusal = harness.calls.length;

    const refused = await runResume({ storedId: "VAL_0000abcd" }, harness.deps, {
      throttle,
      originKey: "origin-a",
    });

    expect(refused).toEqual({ status: "absent" });
    // The refusal performed no lookup: a refused check costs the prober a
    // round trip and teaches the database nothing.
    expect(harness.calls.length).toBe(callsBeforeRefusal);
  });

  it("paces the origin bucket across rotating guesses", async () => {
    const harness = createHarness();
    const throttle = createPublicThrottle(() => 0);

    for (let n = 0; n < 60; n += 1) {
      await runResume({ storedId: `VAL_${n.toString(16).padStart(8, "0")}` }, harness.deps, {
        throttle,
        originKey: "shared-origin",
      });
    }
    const callsBeforeRefusal = harness.calls.length;

    const refused = await runResume({ storedId: "VAL_deadbeef" }, harness.deps, {
      throttle,
      originKey: "shared-origin",
    });

    expect(refused).toEqual({ status: "absent" });
    expect(harness.calls.length).toBe(callsBeforeRefusal);
  });
});

describe("malformed, unknown, and throttled resume failures are indistinguishable", () => {
  it("returns the identical value for all three", async () => {
    const harness = createHarness();
    const gated = createPublicThrottle(() => 0);
    // Exhaust the per-attempt budget for the unknown identifier first.
    for (let n = 0; n < 30; n += 1) {
      await runResume({ storedId: "VAL_ffffffff" }, harness.deps, {
        throttle: gated,
        originKey: "origin-a",
      });
    }

    const malformed = await runResume({ storedId: "not-an-attempt" }, harness.deps);
    const unknown = await runResume({ storedId: "VAL_eeeeeeee" }, harness.deps);
    const throttled = await runResume({ storedId: "VAL_ffffffff" }, harness.deps, {
      throttle: gated,
      originKey: "origin-a",
    });

    // Value equality, not just status equality: any distinguishing field
    // would be the oracle.
    expect(throttled).toEqual(unknown);
    expect(unknown).toEqual(malformed);
    expect(malformed).toEqual({ status: "absent" });
  });

  it("spends throttle budget on malformed guesses too", async () => {
    const harness = createHarness();
    const seen: string[] = [];
    const throttle = createPublicThrottle(() => 0);
    const recording = {
      check: (action: "resume" | "session_open", origin: string, attempt: string) => {
        seen.push(attempt);
        return throttle.check(action, origin, attempt);
      },
    };

    await runResume({ storedId: "???-malformed" }, harness.deps, {
      throttle: recording,
      originKey: "origin-a",
    });

    // The malformed guess still reached the throttle with its own attempted
    // value: pacing happens before the format parse, so only well-formed
    // guesses counting against the budget would let a prober probe shape.
    expect(seen).toEqual(["???-malformed"]);
  });
});

describe("no request-origin value may appear outside the origin module", () => {
  /** Every `.ts`/`.tsx` under `src`, recursively, as relative POSIX paths. */
  function sourceFilesUnder(directory: string): string[] {
    const found: string[] = [];
    for (const entry of readdirSync(directory)) {
      const full = join(directory, entry);
      if (statSync(full).isDirectory()) found.push(...sourceFilesUnder(full));
      else if (full.endsWith(".ts") || full.endsWith(".tsx")) found.push(full.replace(/\\/g, "/"));
    }
    return found.sort();
  }

  /** Whether a line is code rather than comment or blank. */
  function isCode(line: string): boolean {
    const trimmed = line.trim();
    if (trimmed === "") return false;
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
      return false;
    }
    return true;
  }

  it("reads a non-empty application tree, so an empty scan cannot pass", () => {
    expect(sourceFilesUnder("src").length).toBeGreaterThan(100);
  });

  it("confines raw request-origin header names to the origin module", () => {
    // The throttle hashes the origin the moment it arrives; the header VALUE
    // must therefore be readable in exactly one place — the pure reader that
    // names the headers. A second site spelling `x-forwarded-for` is a second
    // place that observes the raw value, and the spec forbids the raw value
    // from reaching research tables, exports, or logs.
    const offenders: string[] = [];
    for (const file of sourceFilesUnder("src")) {
      if (file === "src/lib/admin/origin.ts") continue;
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((raw, index) => {
          if (!isCode(raw)) return;
          if (/x-forwarded-for|x-real-ip|remoteAddr|clientIp|ipAddress/i.test(raw)) {
            offenders.push(`${file}:${index + 1}  ${raw.trim()}`);
          }
        });
    }
    expect(
      offenders,
      `raw origin observed outside the origin module:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("logs no raw attempt or origin value on the throttled resume path", () => {
    // The operator log in `actions.ts` names static sentences; a log line
    // interpolating the attempted identifier or the origin key would persist
    // exactly what the throttle hashes to forget.
    const source = readFileSync("src/lib/validators/actions.ts", "utf8");
    const code = source
      .split("\n")
      .filter((line) => {
        const trimmed = line.trim();
        return trimmed !== "" && !trimmed.startsWith("//") && !trimmed.startsWith("*");
      })
      .join("\n");
    expect(code).not.toMatch(/storedId|originKey.*\$\{|console\.(log|debug|info)/);
  });
});
