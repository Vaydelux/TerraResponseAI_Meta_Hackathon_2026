"use client";

// src/components/map/ClusterPin.tsx
//
// A cluster marker with Framer Motion staggered scale-in entrance
// animation when filters or zoom levels change.

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface ClusterPinProps {
  count: number;
  /** Optional 0-based index for staggered entrance animation. */
  index?: number;
  /** Clicking a cluster zooms in. */
  onClick?: () => void;
  className?: string;
}

export function ClusterPin({ count, index = 0, onClick, className }: ClusterPinProps) {
  return (
    <motion.button
      type="button"
      className={cn("cluster", className)}
      aria-label={`${count} incidents at this location — click to zoom in`}
      onClick={onClick}
      initial={{ opacity: 0, scale: 0.35 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.4 }}
      transition={{
        type: "spring",
        stiffness: 360,
        damping: 24,
        delay: Math.min(index * 0.035, 0.45),
      }}
    >
      {count}
    </motion.button>
  );
}
