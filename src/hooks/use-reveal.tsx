import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Scroll-reveal wrapper. Content is visible by default (no-JS safe); on mount JS
 * adds `.reveal-pending` to hide it, then flips `[data-revealed]` when it enters
 * the viewport — see the reveal rules in src/styles.css.
 *
 * - `stagger`: instead of fading the wrapper as one block, animate direct
 *   children in sequence (for grids like the bento / step / plan cards).
 * - `delay`: extra transition delay (ms) for the wrapper reveal.
 */
export function Reveal({
  children,
  className,
  delay,
  stagger,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  stagger?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    el.classList.add("reveal-pending");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.classList.remove("reveal-pending");
            el.setAttribute("data-revealed", "true");
            observer.disconnect();
          }
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn("reveal", className)}
      data-stagger={stagger ? "" : undefined}
      style={delay ? ({ "--reveal-delay": `${delay}ms` } as CSSProperties) : undefined}
    >
      {children}
    </div>
  );
}
