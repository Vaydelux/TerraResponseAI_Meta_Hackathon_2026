"use client";
import { RouteError } from "@/components/layout/RouteError";
export default function UploadError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError {...props} title="The upload workspace is unavailable" />;
}
