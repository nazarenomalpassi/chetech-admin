"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type WheelEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Battery,
  BatteryCharging,
  Box,
  Cable,
  ChevronLeft,
  ChevronRight,
  Headphones,
  Keyboard,
  Layers3,
  Lightbulb,
  Package,
  PackagePlus,
  Plug,
  Search,
  Speaker,
  Tv,
  Usb,
  Wrench
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { CategoryFormDialog } from "@/features/products/components/category-form-dialog";
import { buildProductCategoryChips, type ProductCategoryIconKey } from "@/features/products/category-bar";
import {
  getCarouselScrollState,
  getNextCarouselScrollLeft,
  getRevealScrollLeft
} from "@/features/products/category-carousel";
import { cn } from "@/lib/utils";

const CATEGORY_ICONS: Record<ProductCategoryIconKey, typeof Package> = {
  all: Layers3,
  adaptadores: Plug,
  auriculares: Headphones,
  cables: Cable,
  cargadores: BatteryCharging,
  iluminacion: Lightbulb,
  parlantes: Speaker,
  pendrives: Usb,
  pilas_baterias: Battery,
  reparacion: Wrench,
  teclados_mouse: Keyboard,
  televisores: Tv,
  vapers: Package,
  varios: Box,
  generic: Box
};

export function ProductFilters({
  categories,
  canManage
}: {
  categories: { id: string; name: string; productCount?: number | null }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [scrollState, setScrollState] = useState({
    canScrollLeft: false,
    canScrollRight: false
  });
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const chipRefs = useRef(new Map<string, HTMLButtonElement>());
  const animationFrameRef = useRef<number | null>(null);
  const autoScrollDirectionRef = useRef<"left" | "right" | null>(null);

  const categoryChips = useMemo(() => buildProductCategoryChips(categories), [categories]);
  const selectedCategory = searchParams.get("category") ?? "all";

  const syncScrollState = useCallback(() => {
    const container = carouselRef.current;

    if (!container) {
      return;
    }

    const nextState = getCarouselScrollState({
      scrollLeft: container.scrollLeft,
      clientWidth: container.clientWidth,
      scrollWidth: container.scrollWidth
    });

    setScrollState((currentState) =>
      currentState.canScrollLeft === nextState.canScrollLeft &&
      currentState.canScrollRight === nextState.canScrollRight
        ? currentState
        : nextState
    );
  }, []);

  const stopAutoScroll = useCallback(() => {
    autoScrollDirectionRef.current = null;

    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  const runAutoScrollRef = useRef<() => void>(() => undefined);

  runAutoScrollRef.current = () => {
    const container = carouselRef.current;
    const direction = autoScrollDirectionRef.current;

    if (!container || !direction) {
      animationFrameRef.current = null;
      return;
    }

    const nextScrollLeft = getNextCarouselScrollLeft(
      {
        scrollLeft: container.scrollLeft,
        clientWidth: container.clientWidth,
        scrollWidth: container.scrollWidth
      },
      direction,
      12
    );

    if (nextScrollLeft === container.scrollLeft) {
      stopAutoScroll();
      syncScrollState();
      return;
    }

    container.scrollLeft = nextScrollLeft;
    syncScrollState();
    animationFrameRef.current = window.requestAnimationFrame(runAutoScrollRef.current);
  };

  const startAutoScroll = useCallback((direction: "left" | "right") => {
    autoScrollDirectionRef.current = direction;

    if (animationFrameRef.current === null) {
      animationFrameRef.current = window.requestAnimationFrame(runAutoScrollRef.current);
    }
  }, []);

  const handleCategoryWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      const container = carouselRef.current;

      if (!container) {
        return;
      }

      const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
      if (maxScroll === 0) {
        return;
      }

      const delta = Math.abs(event.deltaX) > 0 ? event.deltaX : event.deltaY;
      if (!delta) {
        return;
      }

      const nextScrollLeft = Math.min(Math.max(container.scrollLeft + delta, 0), maxScroll);
      if (nextScrollLeft === container.scrollLeft) {
        return;
      }

      event.preventDefault();
      container.scrollLeft = nextScrollLeft;
      syncScrollState();
    },
    [syncScrollState]
  );

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      const previousQuery = params.toString();

      if (!value || value === "all") {
        params.delete(key);
      } else {
        params.set(key, value);
      }

      const query = params.toString();
      if (query === previousQuery) return;

      router.replace(query ? `/productos?${query}` : "/productos");
    },
    [router, searchParams]
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      updateParam("search", search.trim());
    }, 650);

    return () => window.clearTimeout(timeout);
  }, [search, updateParam]);

  useEffect(() => {
    const container = carouselRef.current;

    if (!container) {
      return;
    }

    syncScrollState();

    const handleResize = () => syncScrollState();
    const resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => syncScrollState()) : null;

    resizeObserver?.observe(container);
    if (container.firstElementChild instanceof HTMLElement) {
      resizeObserver?.observe(container.firstElementChild);
    }

    window.addEventListener("resize", handleResize);

    return () => {
      stopAutoScroll();
      resizeObserver?.disconnect();
      window.removeEventListener("resize", handleResize);
    };
  }, [categoryChips.length, stopAutoScroll, syncScrollState]);

  useEffect(() => {
    const container = carouselRef.current;
    const activeChip = chipRefs.current.get(selectedCategory);

    if (!container || !activeChip) {
      syncScrollState();
      return;
    }

    const revealScrollLeft = getRevealScrollLeft(
      {
        scrollLeft: container.scrollLeft,
        clientWidth: container.clientWidth,
        scrollWidth: container.scrollWidth
      },
      {
        itemStart: activeChip.offsetLeft,
        itemWidth: activeChip.offsetWidth
      }
    );

    if (revealScrollLeft === null) {
      syncScrollState();
      return;
    }

    container.scrollTo({
      left: revealScrollLeft,
      behavior: "smooth"
    });

    const syncTimeout = window.setTimeout(() => syncScrollState(), 220);
    return () => window.clearTimeout(syncTimeout);
  }, [selectedCategory, categoryChips.length, syncScrollState]);

  return (
    <>
      <div className="space-y-4">
        <div className="table-toolbar">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-10"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nombre, SKU o palabra clave"
              value={search}
            />
          </div>

          <div className="relative hidden">
            <Layers3 className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Select
              aria-label="Categoria"
              className="pl-10"
              defaultValue={selectedCategory}
              onChange={(event) => updateParam("category", event.target.value)}
              options={[
                { label: "Todas las categorias", value: "all" },
                ...categories.map((category) => ({ label: category.name, value: category.id }))
              ]}
            />
          </div>

          <Select
            defaultValue={searchParams.get("status") ?? "all"}
            onChange={(event) => updateParam("status", event.target.value)}
            options={[
              { label: "Todos los estados", value: "all" },
              { label: "Solo activos", value: "active" },
              { label: "Solo inactivos", value: "inactive" }
            ]}
          />
        </div>

        <div className="relative">
          <div
            aria-hidden={!scrollState.canScrollLeft}
            className={cn(
              "absolute inset-y-0 left-0 z-10 w-16 rounded-l-[28px] transition-opacity duration-200",
              scrollState.canScrollLeft ? "pointer-events-auto" : "pointer-events-none",
              scrollState.canScrollLeft ? "opacity-100" : "opacity-0"
            )}
          >
            <div className="absolute inset-y-0 left-0 w-full bg-[linear-gradient(90deg,rgba(248,248,244,0.98),rgba(248,248,244,0))]" />
            <div className="absolute inset-y-1 left-1 flex w-12 items-center justify-start">
              <div
                className="flex h-full w-full cursor-w-resize items-center justify-center rounded-full text-slate-500/85"
                onMouseEnter={() => startAutoScroll("left")}
                onMouseLeave={stopAutoScroll}
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/90 bg-white/80 shadow-[0_8px_18px_rgba(20,20,19,0.08)]">
                  <ChevronLeft className="h-4 w-4" />
                </span>
              </div>
            </div>
          </div>

          <div
            aria-hidden={!scrollState.canScrollRight}
            className={cn(
              "absolute inset-y-0 right-0 z-10 w-16 rounded-r-[28px] transition-opacity duration-200",
              scrollState.canScrollRight ? "pointer-events-auto" : "pointer-events-none",
              scrollState.canScrollRight ? "opacity-100" : "opacity-0"
            )}
          >
            <div className="absolute inset-y-0 right-0 w-full bg-[linear-gradient(270deg,rgba(248,248,244,0.98),rgba(248,248,244,0))]" />
            <div className="absolute inset-y-1 right-1 flex w-12 items-center justify-end">
              <div
                className="flex h-full w-full cursor-e-resize items-center justify-center rounded-full text-slate-500/85"
                onMouseEnter={() => startAutoScroll("right")}
                onMouseLeave={stopAutoScroll}
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/90 bg-white/80 shadow-[0_8px_18px_rgba(20,20,19,0.08)]">
                  <ChevronRight className="h-4 w-4" />
                </span>
              </div>
            </div>
          </div>

          <div
            className="overflow-x-auto overscroll-x-contain pb-1 pl-1 pr-1 scroll-smooth touch-pan-x [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            onScroll={syncScrollState}
            onWheel={handleCategoryWheel}
            ref={carouselRef}
          >
            <div className="flex min-w-max items-center gap-2.5 px-1">
              {categoryChips.map((chip) => {
                const Icon = CATEGORY_ICONS[chip.icon];
                const isActive = selectedCategory === chip.id || (chip.id === "all" && selectedCategory === "all");

                return (
                  <button
                    ref={(element) => {
                      if (element) {
                        chipRefs.current.set(chip.id, element);
                        return;
                      }

                      chipRefs.current.delete(chip.id);
                    }}
                    className={cn(
                      "group inline-flex min-h-[48px] items-center gap-3 rounded-full border px-4 py-3 text-left text-sm transition duration-200",
                      isActive
                        ? "border-graphite bg-graphite text-white shadow-[0_14px_28px_rgba(20,20,19,0.14)]"
                        : "border-graphite/10 bg-white/88 text-slate-700 hover:border-graphite/18 hover:bg-brand-50 hover:text-graphite"
                    )}
                    key={chip.id}
                    onClick={() => updateParam("category", chip.id)}
                    type="button"
                  >
                    <span
                      className={cn(
                        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition",
                        isActive
                          ? "border-white/10 bg-white/12 text-white"
                          : "border-graphite/10 bg-brand-50 text-slate-500 group-hover:text-graphite"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="whitespace-nowrap font-medium">{chip.label}</span>
                    {typeof chip.count === "number" ? (
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em]",
                          isActive ? "bg-white/12 text-white" : "bg-brand-50 text-slate-500"
                        )}
                      >
                        {chip.count}
                      </span>
                    ) : null}
                  </button>
                );
              })}

              {canManage ? (
                <button
                  className="inline-flex min-h-[48px] items-center gap-3 rounded-full border border-dashed border-graphite/18 bg-white/72 px-4 py-3 text-sm font-medium text-slate-600 transition duration-200 hover:border-graphite/30 hover:bg-white hover:text-graphite"
                  onClick={() => setCategoryDialogOpen(true)}
                  type="button"
                >
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-graphite/10 bg-brand-50 text-slate-600">
                    <PackagePlus className="h-4 w-4" />
                  </span>
                  <span className="whitespace-nowrap">Nueva categoria</span>
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="sr-only">
          <label htmlFor="category-fallback">Categoria</label>
          <Select
            id="category-fallback"
            defaultValue={selectedCategory}
            onChange={(event) => updateParam("category", event.target.value)}
            options={[
              { label: "Todas las categorias", value: "all" },
              ...categories.map((category) => ({ label: category.name, value: category.id }))
            ]}
          />
        </div>
      </div>
      {canManage ? (
        <CategoryFormDialog onClose={() => setCategoryDialogOpen(false)} open={categoryDialogOpen} />
      ) : null}
    </>
  );
}
