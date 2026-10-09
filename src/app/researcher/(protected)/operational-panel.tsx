/**
 * The operational panel: one row per monitored rule, as pure markup over loaded states.
 *
 * Split from the page so the figures are unit-testable without a database or a hook: every
 * number on this screen arrives as a prop. Zero JavaScript of its own — plain markup, so it
 * ships nothing interactive to the browser.
 *
 * ENGLISH CHROME, like every other page under `src/app/researcher/`: the researcher area is a
 * different tool for a different reader and stays outside the interface-locale mechanism.
 */
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";

/** One rule's current-window state, as the page assembled it from repository reads. */
export interface OperationalRuleState {
  readonly rule: string;
  readonly windowStart: string;
  readonly count: number;
  readonly threshold: number;
  readonly breached: boolean;
}

export function OperationalPanel({ states }: { states: readonly OperationalRuleState[] }) {
  return (
    <section aria-label="Operational monitoring" className="mt-8">
      <Card>
        <CardHeader>
          <CardTitle>Operational signals</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="text-small text-ink-muted">
            Aggregate failure counters for the current five-minute window. Counts only — no response
            data and nothing identifying any session.
          </p>
          {states.length === 0 ? (
            <p className="text-body text-ink mt-4">No operational data available.</p>
          ) : (
            <dl className="mt-4 space-y-2">
              {states.map((state) => (
                <div key={state.rule} className="flex items-baseline justify-between gap-4">
                  <dt className="text-body">
                    <code className="text-small text-ink-muted">{state.rule}</code>{" "}
                    <span className="text-small text-ink-muted">
                      {state.count} of {state.threshold}
                    </span>
                  </dt>
                  <dd className="text-heading font-display">
                    {state.breached ? (
                      <span role="status">Breached</span>
                    ) : (
                      <span role="status">Clear</span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </CardBody>
      </Card>
    </section>
  );
}
