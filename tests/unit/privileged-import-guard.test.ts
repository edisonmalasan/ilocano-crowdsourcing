/**
 * Cross-platform privileged-import gate.
 *
 * `sadino/no-privileged-imports` treats files under `src/components/` as
 * browser-side regardless of their own directive. That gate matched only
 * forward-slash paths, so on Windows (backslash `context.filename`) a
 * directive-less component importing a privileged module passed lint
 * silently. These cases drive the REAL rule through ESLint's `Linter` in
 * eslintrc mode with host-style filenames — no fixture files, no CLI spawn.
 *
 * The eslintrc harness is behavior-identical for this rule: the rule reads
 * only `context.filename`, the file text, and the import source string, all
 * of which `Linter.verify` supplies the same way in either mode. Flat mode
 * cannot be used here because it refuses inline configs for named files
 * ("No matching configuration found"), which would make every case report
 * nothing and the suite vacuous.
 */

import { Linter } from "eslint";
import { describe, expect, it } from "vitest";

import { sadinoBoundaryPlugin } from "../../eslint.config.mjs";

const RULE_ID = "no-privileged-imports-probe";

const rule = sadinoBoundaryPlugin.rules["no-privileged-imports"];

const PRIVILEGED_IMPORT = `import { createAdminClient } from "@/lib/supabase/admin";\n`;

const PLAIN_COMPONENT = `${PRIVILEGED_IMPORT}\nexport function probe() {\n  return createAdminClient !== undefined;\n}\n`;

const DIRECTIVE_COMPONENT = `"use client";\n\n${PLAIN_COMPONENT}`;

function ruleErrors(code: string, filename: string) {
  const linter = new Linter({ configType: "eslintrc" });
  linter.defineRule(RULE_ID, rule as unknown as Parameters<Linter["defineRule"]>[1]);
  const messages = linter.verify(
    code,
    {
      parserOptions: { ecmaVersion: 2022, sourceType: "module" },
      rules: { [RULE_ID]: "error" },
    },
    { filename },
  );
  return messages.filter((message) => message.ruleId === RULE_ID);
}

describe("the privileged-import gate fires on any host path separator", () => {
  it("states its own premise: a backslash path does not contain a forward-slash segment", () => {
    expect("C:\\repo\\src\\components\\probe.tsx".includes("/components/")).toBe(false);
  });

  it("reports a directive-less component import on a Windows-style path", () => {
    const errors = ruleErrors(PLAIN_COMPONENT, "C:\\repo\\src\\components\\probe.tsx");
    expect(errors).toHaveLength(1);
  });

  it("reports a directive-less component import on a POSIX-style path", () => {
    const errors = ruleErrors(PLAIN_COMPONENT, "/repo/src/components/probe.tsx");
    expect(errors).toHaveLength(1);
  });

  it("stays silent for a directive-less non-component file on a Windows-style path", () => {
    const errors = ruleErrors(PLAIN_COMPONENT, "C:\\repo\\src\\lib\\probe.ts");
    expect(errors).toHaveLength(0);
  });

  it("reports a directive-carrying file outside components on a Windows-style path", () => {
    const errors = ruleErrors(DIRECTIVE_COMPONENT, "C:\\repo\\src\\lib\\probe.ts");
    expect(errors).toHaveLength(1);
  });
});
