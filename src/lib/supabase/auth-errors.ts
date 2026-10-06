export function isSupabaseAuthRateLimitError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const authError = error as { code?: unknown; message?: unknown; status?: unknown };
  const code = typeof authError.code === "string" ? authError.code : "";
  const message = typeof authError.message === "string" ? authError.message.toLowerCase() : "";

  return authError.status === 429 || code === "over_request_rate_limit" || message.includes("rate limit");
}
