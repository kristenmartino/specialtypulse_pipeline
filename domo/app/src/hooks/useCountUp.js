import { useEffect, useRef, useState } from "react";

const EXPO_OUT = (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

const REDUCED_MOTION =
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * useCountUp — animate a formatted stat from 0 to its final value.
 *
 * Accepts either a number or a formatted string ("$1.7M", "85%", "6,100").
 * The numeric core is animated with an expo-out curve while any prefix/suffix
 * ("$", "M", "%") is preserved, so `fmt.usdCompact` output animates as-is.
 * Falls back to the raw value for non-numeric strings ("38m 2s") and when the
 * user prefers reduced motion.
 */
export default function useCountUp(value, duration = 900) {
  const parsed = parse(value);
  const [display, setDisplay] = useState(
    parsed && !REDUCED_MOTION ? parsed.prefix + format(0, parsed) + parsed.suffix : value
  );
  const rafRef = useRef();

  useEffect(() => {
    if (!parsed || REDUCED_MOTION) {
      setDisplay(value);
      return undefined;
    }
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const current = parsed.target * EXPO_OUT(t);
      setDisplay(parsed.prefix + format(current, parsed) + parsed.suffix);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [String(value), duration]);

  return display;
}

function parse(value) {
  if (typeof value === "number" && isFinite(value)) {
    return { target: value, prefix: "", suffix: "", decimals: 0, grouped: true };
  }
  if (typeof value !== "string") return null;
  const m = value.match(/^([^0-9-]*)(-?[\d,]+(?:\.\d+)?)(.*)$/);
  if (!m) return null;
  const target = Number(m[2].replace(/,/g, ""));
  if (!isFinite(target)) return null;
  const decimalMatch = m[2].match(/\.(\d+)/);
  return {
    target,
    prefix:   m[1],
    suffix:   m[3],
    decimals: decimalMatch ? decimalMatch[1].length : 0,
    grouped:  m[2].includes(","),
  };
}

function format(n, { decimals, grouped }) {
  if (grouped) {
    return Math.round(n).toLocaleString();
  }
  return n.toFixed(decimals);
}
