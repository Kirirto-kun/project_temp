'use client';

import { useEffect, useRef } from 'react';

/**
 * Marks its subtree with data-inview once it scrolls into view (once). CSS uses it to hold
 * one-shot reveals (bar draws, count-ups) until someone can actually see them. The attribute is
 * written straight to the node, so nothing re-renders.
 */
export function InView({ children, className, margin = '-15% 0px' }: { children: React.ReactNode; className?: string; margin?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const reveal = () => node.setAttribute('data-inview', 'true');
    if (typeof IntersectionObserver === 'undefined') return reveal();
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          reveal();
          observer.disconnect();
        }
      },
      { rootMargin: margin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [margin]);
  return (
    <div ref={ref} className={`in-view ${className ?? ''}`}>
      {children}
    </div>
  );
}
