import type { Metadata } from "next";
import { DemoWalkthrough } from "@/components/demo/DemoWalkthrough";

export const metadata: Metadata = {
  title: "Interactive sample walkthrough",
  description: "A resettable, clearly simulated disaster-photo review walkthrough. No live Meta inference or real reports.",
  robots: { index: false, follow: true },
};

export default function WalkthroughPage() {
  return <DemoWalkthrough />;
}
