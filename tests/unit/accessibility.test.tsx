import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { AnswerGroup } from "@/components/validation/answer-option";

/**
 * Accessibility contracts, asserted against real rendered markup.
 *
 * `react-dom/server` is used deliberately: these assertions only need the produced HTML, not a
 * live DOM, so the unit project stays free of a browser-like runtime while still proving that
 * roles, labels, and `aria-*` wiring are actually emitted.
 */

describe("Button", () => {
  it("defaults to type=button so it cannot submit an enclosing form by accident", () => {
    const html = renderToStaticMarkup(<Button>Save</Button>);
    expect(html).toContain('type="button"');
  });

  it("exposes a disabled button as disabled to assistive technology", () => {
    const html = renderToStaticMarkup(<Button disabled>Not yet open</Button>);
    expect(html).toContain("disabled");
    expect(html).toContain('aria-disabled="true"');
  });

  it("carries a focus-visible ring so the focus state is not colour-only", () => {
    const html = renderToStaticMarkup(<Button>Save</Button>);
    expect(html).toContain("focus-visible:outline-[3px]");
  });
});

describe("Field", () => {
  function renderField(props: { description?: string; error?: string; id?: string }): string {
    return renderToStaticMarkup(
      <Field label="Corrected Ilocano" id="corrected" {...props}>
        {({ id, describedBy, invalid }) => (
          <textarea id={id} aria-describedby={describedBy} aria-invalid={invalid || undefined} />
        )}
      </Field>,
    );
  }

  it("associates the label with the control so the control has an accessible name", () => {
    const html = renderField({});
    expect(html).toContain('for="corrected"');
    expect(html).toContain('id="corrected"');
  });

  it("points aria-describedby at the description when one is present", () => {
    const html = renderField({ description: "Write it the way you would say it." });
    expect(html).toContain('id="corrected-description"');
    expect(html).toContain('aria-describedby="corrected-description"');
  });

  it("points aria-describedby at both the description and the error when both exist", () => {
    const html = renderField({ description: "Your version.", error: "This one is required." });
    expect(html).toContain('aria-describedby="corrected-description corrected-error"');
  });

  it("marks the control invalid and announces the message as an alert", () => {
    const html = renderField({ error: "This one is required." });
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("This one is required.");
  });

  it("leaves the control valid when there is no error", () => {
    const html = renderField({});
    expect(html).not.toContain('aria-invalid="true"');
  });
});

describe("AnswerGroup", () => {
  const options = [
    { value: "correct_natural", label: "Correct and natural" },
    { value: "correct_unnatural", label: "Correct but sounds unnatural" },
    { value: "incorrect", label: "Incorrect" },
    { value: "cannot_evaluate", label: "Cannot confidently evaluate" },
  ];

  function renderGroup(value: string | null): string {
    return renderToStaticMarkup(
      <AnswerGroup
        legend="Does the Ilocano sentence correctly express the intended information?"
        options={options}
        value={value}
        onChange={() => {}}
      />,
    );
  }

  it("exposes a labelled radiogroup containing four radios", () => {
    const html = renderGroup(null);
    expect(html).toContain('role="radiogroup"');
    expect((html.match(/role="radio"/g) ?? []).length).toBe(4);
  });

  it("marks exactly the selected option as checked", () => {
    const html = renderGroup("incorrect");
    const checked = html.match(/aria-checked="true"/g) ?? [];
    expect(checked.length).toBe(1);
    expect(html).toContain('aria-checked="true"');
  });

  it("marks nothing checked before a selection is made", () => {
    const html = renderGroup(null);
    expect(html).not.toContain('aria-checked="true"');
  });

  it("uses roving tabindex so only one option is in the tab order", () => {
    const html = renderGroup(null);
    expect((html.match(/tabindex="0"/g) ?? []).length).toBe(1);
    expect((html.match(/tabindex="-1"/g) ?? []).length).toBe(3);
  });

  it("announces the question as the group's accessible name", () => {
    const html = renderGroup(null);
    expect(html).toContain("Does the Ilocano sentence correctly express the intended information?");
  });
});
