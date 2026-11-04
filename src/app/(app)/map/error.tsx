"use client";
import { RouteError } from "@/components/layout/RouteError";
export default function MapError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError {...props} title="The incident map is temporarily unavailable" />;
}
