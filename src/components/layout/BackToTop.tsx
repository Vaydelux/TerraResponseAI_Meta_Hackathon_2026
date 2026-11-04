"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowUp } from "lucide-react";

/**
 * A single global affordance for long public and authenticated pages.
 * Only tracks the document viewport: the map, filters, drawers and tables
 * retain their native nested scrolling and gesture behavior.
 */
export function BackToTop() {
  const pathname = usePathname();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      setIsVisible(window.scrollY > Math.max(480, window.innerHeight * 0.65));
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [pathname]);

  if (!isVisible) return null;

  const isMap = pathname === "/map" || pathname === "/dashboard";
  const hasMobileReviewActions = Boolean(pathname?.startsWith("/review/"));
  const bottom = hasMobileReviewActions
    ? "calc(env(safe-area-inset-bottom, 0px) + 8rem)"
    : isMap
      ? "calc(env(safe-area-inset-bottom, 0px) + 5rem)"
      : "calc(env(safe-area-inset-bottom, 0px) + 1.25rem)";

  function goToTop() {
    // Direct keyboard and screen-reader users back to the main landmark.
    document.getElementById("main-content")?.focus({ preventScroll: true });
    const reduceMotion = typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  }

  return (
    <button
      type="button"
      data-testid="back-to-top"
      aria-label="Back to top"
      title="Back to top"
      onClick={goToTop}
      style={{ bottom }}
      className={
        "fixed z-30 inline-flex min-h-12 min-w-12 items-center justify-center gap-2 rounded-full " +
        "border border-[var(--rule-strong)] bg-[var(--sheet)] p-1.5 text-[var(--ink)] " +
        "shadow-[var(--lift)] transition-[transform,background-color,border-color,box-shadow] duration-200 " +
        "hover:-translate-y-0.5 hover:border-[var(--tide)] hover:bg-[var(--tide-wash)] " +
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tide)] " +
        "active:translate-y-0 active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none " +
        "sm:pr-4 " + (isMap ? "right-4 sm:right-6" : "left-4 sm:left-6")
      }
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--tide)] text-[var(--on-tide)]">
        <ArrowUp size={19} strokeWidth={2.5} aria-hidden="true" />
      </span>
      <span className="hidden whitespace-nowrap text-sm font-semibold sm:inline">Back to top</span>
    </button>
  );
}
