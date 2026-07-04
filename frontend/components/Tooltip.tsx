"use client";

/**
 * Minimal tooltip: black background, white monospace text, instant show,
 * no easing. Anchored to the wrapped child via mouse events.
 */

import { AnimatePresence, motion } from "framer-motion";
import { useState, type ReactNode } from "react";

interface TooltipProps {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Tooltip({ label, children, className = "" }: TooltipProps) {
  const [open, setOpen] = useState(false);

  return (
    <span
      className={`relative inline-flex ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      <AnimatePresence>
        {open && (
          <motion.span
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.08, ease: "linear" }}
            className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 -translate-x-1/2 whitespace-nowrap border border-black bg-black px-2 py-1 font-mono text-[11px] uppercase tracking-wide text-white shadow-[2px_2px_0_0_#000]"
            role="tooltip"
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}