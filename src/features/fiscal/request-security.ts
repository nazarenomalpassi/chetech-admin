export class FiscalHttpError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
export function assertFiscalOrigin(request: Request) {
  if (!isSameOriginRequest(request) || request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    throw new FiscalHttpError(403, "La emision requiere una confirmacion desde esta aplicacion.");
  }
}
export async function readFiscalJson(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new FiscalHttpError(400, "Faltan datos de la solicitud.");
  let size = 0; const chunks: Uint8Array[] = [];
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > 16384) { await reader.cancel(); throw new FiscalHttpError(413, "Solicitud fiscal demasiado grande."); }
    chunks.push(part.value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; }
  catch { throw new FiscalHttpError(400, "JSON fiscal invalido."); }
}
import { isSameOriginRequest } from "@/lib/request-origin";
