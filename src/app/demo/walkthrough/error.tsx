"use client";

import { Button } from "@/components/ui-tr/Button";

export default function WalkthroughError({ reset }: { reset: () => void }) {
  return <main id="main-content" tabIndex={-1} className="mx-auto grid min-h-[60vh] max-w-xl content-center gap-5 p-6">
    <h1 className="text-2xl font-bold">The sample walkthrough could not open</h1>
    <p role="alert">No real report was submitted or changed. Restart the simulation, or return to the overview.</p>
    <Button onClick={reset} variant="primary">Restart sample walkthrough</Button>
    <Button href="/">Back to overview</Button>
  </main>;
}
