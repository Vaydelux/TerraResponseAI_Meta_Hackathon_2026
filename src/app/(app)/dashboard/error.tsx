"use client";
import { RouteError } from "@/components/layout/RouteError";
export default function DashboardError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError {...props} title="Dashboard data is temporarily unavailable" />;
}
