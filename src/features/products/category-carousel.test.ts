import { describe, expect, it } from "vitest";

import {
  applyAutoScrollStep,
  getCarouselScrollState,
  getHorizontalWheelDelta,
  getRevealScrollLeft
} from "@/features/products/category-carousel";

describe("category carousel helpers", () => {
  it("detecta cuando hay contenido hacia ambos lados", () => {
    expect(
      getCarouselScrollState({
        scrollLeft: 120,
        clientWidth: 420,
        scrollWidth: 1000
      })
    ).toEqual({
      canScrollLeft: true,
      canScrollRight: true
    });
  });

  it("frena el hover scroll al llegar al final", () => {
    const container = {
      scrollLeft: 580,
      clientWidth: 420,
      scrollWidth: 1000
    };

    expect(applyAutoScrollStep(container, "right", 24)).toBe(false);
    expect(container.scrollLeft).toBe(580);
  });

  it("calcula un scroll centrado para revelar la categoria activa fuera de vista", () => {
    expect(
      getRevealScrollLeft(
        {
          scrollLeft: 0,
          clientWidth: 360,
          scrollWidth: 1200
        },
        {
          itemStart: 620,
          itemWidth: 120
        }
      )
    ).toBe(500);
  });

  it("no mueve el carrusel si la categoria activa ya esta visible", () => {
    expect(
      getRevealScrollLeft(
        {
          scrollLeft: 160,
          clientWidth: 360,
          scrollWidth: 1200
        },
        {
          itemStart: 220,
          itemWidth: 120
        }
      )
    ).toBeNull();
  });

  it("mueve scrollLeft directamente cuando hay lugar para avanzar", () => {
    const container = {
      scrollLeft: 120,
      clientWidth: 420,
      scrollWidth: 1000
    };

    expect(applyAutoScrollStep(container, "right", 18)).toBe(true);
    expect(container.scrollLeft).toBe(138);
  });

  it("convierte la rueda vertical en scroll horizontal para la barra", () => {
    expect(getHorizontalWheelDelta(0, 64)).toBe(64);
    expect(getHorizontalWheelDelta(32, 10)).toBe(32);
  });
});
