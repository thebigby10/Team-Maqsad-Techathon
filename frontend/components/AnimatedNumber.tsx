"use client";

/**
 * Renders a monospace number with `font-variant-numeric: tabular-nums` so
 * digits don't shift width. When the value changes, the digit changes are
 * laid out by Framer Motion (the digit "slides" up into place).
 *
 * Why this matters: the live wattage header updates many times per minute.
 * A plain `{value}` swap looks jittery; a layout animation feels like a
 * physical counter flipping.
 */

import { motion } from "framer-motion";
import { useMemo } from "react";

interface AnimatedNumberProps {
  value: number;
  /** Optional prefix shown before the digits (e.g. "$"). */
  prefix?: string;
  /** Optional suffix shown after the digits (e.g. " W"). */
  suffix?: string;
  /** Decimal places — default 0. */
  decimals?: number;
  /** Tailwind class for the wrapping span. */
  className?: string;
}

export function AnimatedNumber({
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
  className = "",
}: AnimatedNumberProps) {
  const formatted = useMemo(() => {
    const n = Number.isFinite(value) ? value : 0;
    return n.toFixed(decimals);
  }, [value, decimals]);

  return (
    <span className={`tabular inline-flex items-baseline ${className}`}>
      {prefix && <span aria-hidden="true">{prefix}</span>}
      {formatted.split("").map((char, idx) => (
        <DigitSlot key={`${idx}-${char === "." ? "." : "d"}`} char={char} />
      ))}
      {suffix && <span aria-hidden="true">{suffix}</span>}
    </span>
  );
}

function DigitSlot({ char }: { char: string }) {
  // Punctuation (".", "-") is rendered as a stable element; only digits
  // are layout-animated, so the decimal point never shifts.
  if (!/\d/.test(char)) {
    return <span aria-hidden="true">{char}</span>;
  }
  return (
    <span
      className="relative inline-block overflow-hidden align-baseline"
      style={{ height: "1em", lineHeight: 1 }}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 600, damping: 35 }}
        className="inline-block"
      >
        {char}
      </motion.span>
    </span>
  );
}