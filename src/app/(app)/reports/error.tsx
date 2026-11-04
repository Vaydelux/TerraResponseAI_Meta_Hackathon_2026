"use client";
import { RouteError } from "@/components/layout/RouteError";
export default function ReportsError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError {...props} title="Reports could not be loaded" />;
}
