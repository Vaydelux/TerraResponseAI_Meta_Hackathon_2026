"use client";
import { RouteError } from "@/components/layout/RouteError";
export default function ReviewError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError {...props} title="The review queue is temporarily unavailable" />;
}
