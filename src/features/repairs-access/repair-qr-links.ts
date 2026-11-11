import { z } from "zod";

export const repairQrId = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());

export const LEGACY_REPAIR_QR_MISSING_HEADERS = [
  "rsc",
  "next-action",
  "content-type",
] as const;
export const LEGACY_REPAIR_QR_CONTEXT_PARAMETERS = [
  "status",
  "error",
  "q",
  "state",
  "warranty",
  "scope",
  "cursor",
  "wq",
  "wp",
  "wh",
  "pp",
  "pq",
  "pf",
  "pc",
  "cp",
  "from",
  "to",
] as const;
export function getLegacyRepairQrId(
  method: string,
  url: Pick<URL, "pathname" | "searchParams">,
  headers: Headers,
) {
  if (
    !["GET", "HEAD"].includes(method) ||
    url.pathname !== "/reparaciones-access" ||
    url.searchParams.get("view") !== "detalle" ||
    LEGACY_REPAIR_QR_MISSING_HEADERS.some((name) => headers.has(name)) ||
    Array.from(url.searchParams.keys()).some(
      (key) => key !== "view" && key !== "order",
    ) ||
    url.searchParams.getAll("view").length !== 1 ||
    url.searchParams.getAll("order").length !== 1
  )
    return null;
  const id = repairQrId.safeParse(url.searchParams.get("order"));
  return id.success ? id.data : null;
}
export function getPrivateRepairPath(id: string) {
  return `/reparaciones-access/orden/${repairQrId.parse(id)}`;
}
export function buildRepairQrUrl(id: string, baseUrl: string) {
  return new URL(`/q/${repairQrId.parse(id)}`, baseUrl).toString();
}
