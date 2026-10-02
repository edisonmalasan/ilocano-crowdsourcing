import Link from "next/link";

import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";

import type { DisqualifyReason } from "@/lib/domain/review-reasons";
import type { EntryReview } from "@/lib/admin/dashboard";

/**
 * One entry's full inspection, as pure markup over already-loaded data.
 *
 * Split from the route for the same reason as the overview: every research string on this screen
 * arrives as a prop, so a test rendering it with a hand-built review proves each validator's
 * content appears under that validator and nowhere else. Research text is rendered EXACTLY as
 * stored — no catalog lookup, no label substitution, no merging. Proficiency and evaluation are
 * shown as the stored machine-readable values beside a human reading, because localizing a value
 * would change what the record means rather than how it reads (see the copy catalog's rules).
 */

const REASON_COPY: Record<DisqualifyReason, string> = {
  unevaluable: "Marked cannot confidently evaluate — abstentions never count toward coverage.",
  "missing-correction": "A correction was required for this evaluation but none was supplied.",
  "missing-english": "The English translation is missing or blank.",
  "missing-filipino": "The Filipino translation is missing or blank.",
};

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  // A stored field that is absent renders as nothing — not as "null", not as an empty row. The
  // repository maps SQL NULL to an absent key, and the schema forbids blank research text, so a
  // nullish value here means "not supplied", which is displayable only by its absence.
  if (value === null || value === undefined) return null;
  return (
    <div>
      <p className="text-small text-ink-muted">{label}</p>
      <p className="text-body text-ink mt-1">{value}</p>
    </div>
  );
}

export function EntryReviewView({ review }: { review: EntryReview }) {
  return (
    <>
      <section aria-label="Source entry">
        <Card>
          <CardHeader>
            <CardTitle>{review.entry.id}</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="space-y-4">
              <Field label="Original Ilocano instruction" value={review.entry.instruction} />
              <Field label="Origin" value={review.entry.origin ?? "—"} />
              <Field label="Destination" value={review.entry.destination ?? "—"} />
              <Field label="Transit mode" value={review.entry.transitMode ?? "—"} />
              <p className="text-small text-ink-muted">
                {review.qualifyingCount} of 3 qualifying validations
                {review.needsReview ? " · flagged for researcher review" : ""}
              </p>
            </div>
          </CardBody>
        </Card>
      </section>

      <section aria-label="Stored responses" className="mt-8">
        <h2 className="text-heading mb-4">Responses ({review.responses.length} stored)</h2>
        {review.responses.length === 0 && (
          <p className="text-body text-ink">No validator has answered this entry yet.</p>
        )}
        <div className="space-y-4">
          {review.responses.map(({ response, proficiency, qualifies, disqualifyReason }) => (
            <Card key={response.id} tone="inset" data-validator={response.validatorId}>
              <CardBody>
                <div className="space-y-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-small text-ink-muted">
                      Validator <code>{response.validatorId}</code> · proficiency:{" "}
                      <code>{proficiency ?? "not recorded"}</code>
                    </p>
                    <p className="text-small font-bold">
                      {qualifies ? (
                        <span>Counts toward coverage</span>
                      ) : (
                        <span>
                          Does not count
                          {disqualifyReason !== null && ` — ${REASON_COPY[disqualifyReason]}`}
                        </span>
                      )}
                    </p>
                  </div>
                  <Field label="Evaluation" value={response.evaluation} />
                  <Field label="Corrected Ilocano" value={response.correctedInstruction} />
                  <Field label="English translation" value={response.englishTranslation} />
                  <Field label="Filipino translation" value={response.filipinoTranslation} />
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>

      <p className="mt-8">
        <Link href="/researcher" className="font-display font-bold underline">
          Back to dashboard
        </Link>
      </p>
    </>
  );
}
