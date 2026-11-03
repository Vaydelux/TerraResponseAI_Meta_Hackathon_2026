import { RouteLoading } from "@/components/layout/RouteLoading";

// Next.js prefetches this route-group boundary instead of waiting for all
// authentication and database requests to finish before tab navigation.
export default function Loading() {
  return <RouteLoading label="Loading workspace" />;
}
