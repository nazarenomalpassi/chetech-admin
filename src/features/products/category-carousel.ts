export type CarouselMetrics = {
  scrollLeft: number;
  clientWidth: number;
  scrollWidth: number;
};

export type RevealTarget = {
  itemStart: number;
  itemWidth: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function getCarouselScrollState(metrics: CarouselMetrics, tolerance = 8) {
  const maxScroll = Math.max(0, metrics.scrollWidth - metrics.clientWidth);

  return {
    canScrollLeft: metrics.scrollLeft > tolerance,
    canScrollRight: metrics.scrollLeft < maxScroll - tolerance
  };
}

export function getNextCarouselScrollLeft(
  metrics: CarouselMetrics,
  direction: "left" | "right",
  step = 18
) {
  const maxScroll = Math.max(0, metrics.scrollWidth - metrics.clientWidth);
  const nextValue = direction === "left" ? metrics.scrollLeft - step : metrics.scrollLeft + step;

  return clamp(nextValue, 0, maxScroll);
}

export function getRevealScrollLeft(
  metrics: CarouselMetrics,
  target: RevealTarget,
  safePadding = 24
) {
  const visibleStart = metrics.scrollLeft + safePadding;
  const visibleEnd = metrics.scrollLeft + metrics.clientWidth - safePadding;
  const itemEnd = target.itemStart + target.itemWidth;

  if (target.itemStart >= visibleStart && itemEnd <= visibleEnd) {
    return null;
  }

  const maxScroll = Math.max(0, metrics.scrollWidth - metrics.clientWidth);
  const centeredOffset = target.itemStart - (metrics.clientWidth - target.itemWidth) / 2;

  return clamp(centeredOffset, 0, maxScroll);
}
