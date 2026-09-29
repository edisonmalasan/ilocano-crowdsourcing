import Link from "next/link";

import { linkButtonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col justify-center gap-6 px-5 py-16 sm:px-8"
    >
      <p className="label-meta text-accent">Error 404</p>
      <h1 className="text-title">This page isn&rsquo;t here.</h1>

      <Card>
        <p className="text-small text-ink-muted">
          The address may have changed, or the link may be incomplete. Nothing you have submitted is
          affected.
        </p>
        <div className="mt-5">
          {/* A real link, not a disabled button: it navigates and it takes Enter. */}
          <Link href="/" className={linkButtonClasses()}>
            Go back to the start
          </Link>
        </div>
      </Card>
    </main>
  );
}
