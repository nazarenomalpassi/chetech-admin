import { describe, expect, it } from "vitest";

import {
  getCarouselScrollState,
  getNextCarouselScrollLeft,
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
    expect(
      getNextCarouselScrollLeft(
        {
          scrollLeft: 580,
          clientWidth: 420,
          scrollWidth: 1000
        },
        "right",
        24
      )
    ).toBe(580);
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
});
