import { useState, useEffect } from "react";

interface WindowSize {
  width: number;
  height: number;
}

/** Responsive breakpoints matching Tailwind defaults. */
export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
} as const;

/**
 * Returns the current window inner dimensions and updates on resize.
 * Debounces resize events to avoid excessive re-renders.
 */
export function useWindowSize(): WindowSize {
  const [size, setSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  useEffect(() => {
    let rafId: number;
    function handleResize() {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        setSize({ width: window.innerWidth, height: window.innerHeight });
      });
    }
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(rafId);
    };
  }, []);

  return size;
}
