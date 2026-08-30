import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

type Props = {
  layoutKey: string;
  children: ReactNode;
};

type Fit = {
  scale: number;
  widthPx: number | null;
};

export function TvFit({ layoutKey, children }: Props) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<Fit | null>(null);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    inner.style.width = 'max-content';
    const naturalW = Math.max(inner.scrollWidth, inner.offsetWidth);
    const naturalH = Math.max(inner.scrollHeight, inner.offsetHeight);
    inner.style.width = '';

    const apply = () => {
      const availW = outer.clientWidth;
      const availH = outer.clientHeight;
      if (availW <= 0 || availH <= 0 || naturalW <= 0 || naturalH <= 0) {
        return;
      }
      const scaleH = availH / naturalH;
      const next: Fit =
        naturalW * scaleH <= availW + 1
          ? { scale: scaleH, widthPx: availW / scaleH }
          : { scale: availW / naturalW, widthPx: null };
      setFit((prev) => {
        if (
          prev &&
          Math.abs(prev.scale - next.scale) < 0.002 &&
          ((prev.widthPx == null && next.widthPx == null) ||
            (prev.widthPx != null &&
              next.widthPx != null &&
              Math.abs(prev.widthPx - next.widthPx) < 1))
        ) {
          return prev;
        }
        return next;
      });
    };

    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(outer);
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', apply);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', apply);
      window.removeEventListener('orientationchange', apply);
    };
  }, [layoutKey]);

  return (
    <div ref={outerRef} className="tv-fit">
      <div
        ref={innerRef}
        className={`tv-fit-inner${fit?.widthPx != null ? ' is-wide' : ''}`}
        style={{
          width: fit?.widthPx != null ? `${fit.widthPx}px` : 'max-content',
          transform: `translate(-50%, -50%) scale(${fit?.scale ?? 1})`,
          visibility: fit == null ? 'hidden' : 'visible',
        }}
      >
        {children}
      </div>
    </div>
  );
}
