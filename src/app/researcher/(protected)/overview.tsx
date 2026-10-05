import Link from "next/link";

import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { linkButtonClasses } from "@/components/ui/button";
import { RESEARCHER_EXPORT } from "@/lib/admin/routes";

import type { DashboardOverview } from "@/lib/admin/dashboard";

/**
 * The overview figures, as pure markup over already-loaded data.
 *
 * Split from the page so the figures are unit-testable without a database, a credential, or a
 * router: every number on this screen arrives as a prop, and a test that renders it with a
 * hand-counted overview proves the screen shows what the service computed rather than what a
 * mock returned. There is deliberately no client component here — links are plain anchors, so
 * this screen ships zero JavaScript of its own.
 *
 * ENGLISH CHROME, and that is consistency rather than an omission. No page under
 * `src/app/researcher/` uses the interface-locale mechanism, and the research DATA on this
 * screen (Ilocano instructions, corrections, both translations) is rendered as stored regardless
 * of locale. Localizing the chrome while the sign-in page beside it stays English would be the
 * half-localized instrument the copy catalog exists to prevent.
 *
 * No placeholder numbers anywhere: every figure renders from the overview object, and an empty
 * dataset renders real zeroes. A zero on a research dashboard reads as a measurement, so a zero
 * here IS one.
 */

function Figure({
  label,
  value,
  hint,
  wide,
}: {
  label: string;
  value: string;
  hint?: string;
  wide?: boolean;
}) {
  return (
    <div
      className={
        "border-ink bg-paper-sunken rounded-card border-2 p-4" +
        (wide === true ? " col-span-2 sm:col-span-3" : "")
      }
    >
      <p className="text-small text-ink-muted">{label}</p>
      <p className={`font-display mt-1 ${wide === true ? "text-title" : "text-heading"}`}>
        {value}
      </p>
      {hint !== undefined && <p className="text-small text-ink-muted mt-1">{hint}</p>}
    </div>
  );
}

export function OverviewView({ overview }: { overview: DashboardOverview }) {
  return (
    <>
      <section aria-label="Data export">
        <Card tone="accent">
          <CardHeader>
            <CardTitle>Data export</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="text-body text-ink">
              The current corpus as one dated ZIP: every stored response, the per-entry summary, and
              the mechanical validated dataset, still awaiting adjudication.
            </p>
            <p className="mt-4">
              <Link href={RESEARCHER_EXPORT} className={linkButtonClasses()}>
                Export data
              </Link>
            </p>
          </CardBody>
        </Card>
      </section>

      <section aria-label="Coverage totals" className="mt-8">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Figure label="Dataset entries" value={String(overview.totalEntries)} />
          <Figure
            label="Qualifying validations"
            value={String(overview.totalQualifyingValidations)}
          />
          <Figure
            label="Validators who submitted responses"
            value={String(overview.totalValidators)}
          />
          <Figure
            label="Overall completion"
            value={`${overview.coveragePercentage}%`}
            hint={`Complete entries, out of ${overview.totalEntries} entries`}
            wide
          />
          <Figure label="Complete entries" value={String(overview.buckets.complete)} />
          <Figure label="Incomplete entries" value={String(overview.buckets.incomplete)} />
          <Figure label="Stored responses" value={String(overview.totalResponses)} />
          <Figure label="Cannot-evaluate responses" value={String(overview.cannotEvaluateCount)} />
          <Figure
            label="Entries with extra packages"
            value={String(overview.extraPackageEntries.length)}
            hint={
              overview.extraPackageEntries.length === 0
                ? "No overlapping entries"
                : `Entries: ${overview.extraPackageEntries.join(", ")}`
            }
          />
          <Figure
            label="Late-arrival responses"
            value={String(overview.lateArrivalCount)}
            hint={
              overview.lateArrivalCount === 0
                ? "No late arrivals"
                : `Entries: ${overview.lateArrivalEntryIds.join(", ")}`
            }
          />
          <Figure label="Needs researcher review" value={String(overview.reviewEntryIds.length)} />
        </div>
      </section>

      <section aria-label="Evaluation distribution" className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle>Evaluations</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="text-small text-ink-muted">
              Stored responses by evaluation value. Every stored row counts here, including ones
              that do not qualify toward coverage.
            </p>
            <dl className="mt-4 space-y-2">
              {(
                [
                  ["correct_natural", "Correct and natural"],
                  ["correct_unnatural", "Correct but sounds unnatural"],
                  ["incorrect", "Incorrect"],
                  ["cannot_evaluate", "Cannot confidently evaluate"],
                ] as const
              ).map(([value, label]) => (
                <div key={value} className="flex items-baseline justify-between gap-4">
                  <dt className="text-body">
                    {label} <code className="text-small text-ink-muted">{value}</code>
                  </dt>
                  <dd className="text-heading font-display">
                    {overview.evaluationDistribution[value]}
                  </dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>
      </section>

      <section aria-label="Proficiency breakdown" className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle>Proficiency, self-reported</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="text-small text-ink-muted">
              Validators who answered, grouped by the proficiency they reported. Metadata, not a
              score. Nothing here ranks or weights anyone.
            </p>
            <dl className="mt-4 space-y-2">
              {(
                [
                  ["native", "Native / first-language speaker"],
                  ["fluent", "Fluent"],
                  ["conversational", "Conversational"],
                  ["basic", "Basic"],
                  ["not_confident", "Not confident"],
                  ["unrecorded", "Not recorded"],
                ] as const
              ).map(([value, label]) => (
                <div key={value} className="flex items-baseline justify-between gap-4">
                  <dt className="text-body">
                    {label}{" "}
                    {value !== "unrecorded" && (
                      <code className="text-small text-ink-muted">{value}</code>
                    )}
                  </dt>
                  <dd className="text-heading font-display">
                    {overview.proficiencyBreakdown[value]}
                  </dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>
      </section>

      <section aria-label="Entries requiring researcher review" className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle>Needs researcher review</CardTitle>
          </CardHeader>
          <CardBody>
            {overview.reviewEntryIds.length === 0 ? (
              <p className="text-body text-ink">
                No entries currently meet the review rule. One lands here when its qualifying
                validators disagree on evaluation, or when more than one distinct correction was
                submitted, never over translation wording alone.
              </p>
            ) : (
              <ul className="space-y-2">
                {overview.reviewEntryIds.map((id) => (
                  <li key={id}>
                    <Link
                      href={`/researcher/entries/${id}`}
                      className="font-display font-bold underline"
                    >
                      {id}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </section>
    </>
  );
}
