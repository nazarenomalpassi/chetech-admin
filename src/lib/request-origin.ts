export function isSameOriginRequest(request: Request) {
  const rawOrigin = request.headers.get("origin");
  if (!rawOrigin || rawOrigin === "null") return false;
  try {
    const origin = new URL(rawOrigin);
    const internal = new URL(request.url);
    const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0].trim();
    const protocol = forwardedProtocol ? `${forwardedProtocol}:` : internal.protocol;
    if (!["http:", "https:"].includes(protocol) || origin.username || origin.password) return false;
    // Next may expose its internal URL; Host remains the request's public authority.
    const authority = new URL(`${protocol}//${request.headers.get("host") || internal.host}`);
    return !authority.username && !authority.password && origin.origin === authority.origin;
  } catch {
    return false;
  }
}
