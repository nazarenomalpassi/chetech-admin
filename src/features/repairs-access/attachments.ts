export const MAX_REPAIR_IMAGE_BYTES = 4 * 1024 * 1024;
export function validateRepairImage(bytes: Uint8Array, mime: string): "jpg" | "png" | "webp" {
  if (bytes.length < 8 || bytes.length > MAX_REPAIR_IMAGE_BYTES) throw new Error("La foto debe pesar hasta 4 MB.");
  if (mime === "image/jpeg" && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "jpg";
  if (mime === "image/png" && [137,80,78,71,13,10,26,10].every((n, i) => bytes[i] === n)) return "png";
  const text = new TextDecoder("ascii");
  if (mime === "image/webp" && text.decode(bytes.slice(0,4)) === "RIFF" && text.decode(bytes.slice(8,12)) === "WEBP") return "webp";
  throw new Error("Usa una foto JPG, PNG o WebP valida.");
}
