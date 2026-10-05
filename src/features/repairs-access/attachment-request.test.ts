import { describe, expect, it } from "vitest";
import { isSameOriginUpload } from "./attachment-request";

describe("origen de fotos privadas", () => {
  it("permite solo el formulario del propio sistema", () => {
    expect(isSameOriginUpload(new Request("https://chetech.example/api/photos", { headers: { origin: "https://chetech.example" } }))).toBe(true);
    expect(isSameOriginUpload(new Request("https://chetech.example/api/photos", { headers: { origin: "https://otro.example" } }))).toBe(false);
    expect(isSameOriginUpload(new Request("https://chetech.example/api/photos"))).toBe(false);
    expect(isSameOriginUpload(new Request("https://chetech.example/api/photos", { headers: { origin: "null" } }))).toBe(false);
  });
  it("usa el host publico cuando Next entrega una URL interna", () => {
    const request = new Request("http://localhost:3001/api/photos", { headers: { host: "127.0.0.1:3001", origin: "http://127.0.0.1:3001" } });
    expect(isSameOriginUpload(request)).toBe(true);
    expect(isSameOriginUpload(new Request("http://localhost/api/photos", { headers: { host: "chetech.example", "x-forwarded-proto": "https", origin: "https://chetech.example" } }))).toBe(true);
    expect(isSameOriginUpload(new Request("http://localhost/api/photos", { headers: { host: "chetech.example", "x-forwarded-proto": "https", origin: "https://otro.example" } }))).toBe(false);
  });
});
