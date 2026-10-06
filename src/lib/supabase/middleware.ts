import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";

import type { Database } from "@/lib/db/types";
import { getSupabasePublicKey, hasSupabaseEnv } from "@/lib/supabase/config";
import { isSupabaseAuthRateLimitError } from "@/lib/supabase/auth-errors";

function hasSupabaseAuthCookie(request: NextRequest) {
  return request.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith("sb-") && cookie.name.endsWith("-auth-token"));
}

export function redirectPreservingCookies(url: URL, sourceResponse: NextResponse) {
  const redirectResponse = NextResponse.redirect(url);

  sourceResponse.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie);
  });

  return redirectResponse;
}

export function getSessionRedirectPath({
  hasSession,
  isAuthRoute,
  isProtectedRoute
}: {
  hasSession: boolean;
  isAuthRoute: boolean;
  isProtectedRoute: boolean;
}) {
  if (!hasSession && isProtectedRoute) return "/login";
  if (hasSession && isAuthRoute) return "/dashboard";
  return null;
}

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isAuthRoute = pathname.startsWith("/login");
  const isAccessDeniedRoute = pathname.startsWith("/acceso-denegado");
  const isPublicRoute =
    pathname === "/" ||
    isAccessDeniedRoute ||
    (!hasSupabaseEnv() && pathname.startsWith("/admin"));
  const isProtectedRoute = !isAuthRoute && !isPublicRoute;

  if (!hasSupabaseEnv()) {
    if (isProtectedRoute) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin";
      url.searchParams.set("setup", "supabase");
      return NextResponse.redirect(url);
    }

    return NextResponse.next({
      request: {
        headers: request.headers
      }
    });
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers
    }
  });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getSupabasePublicKey()!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          const previousCookies = response.cookies.getAll();
          // Rebuild forwarded headers after refresh so RSCs receive the new token.
          response = NextResponse.next({ request: { headers: request.headers } });
          previousCookies.forEach((cookie) => response.cookies.set(cookie));
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        }
      }
    }
  );

  let hasSession = false;
  try {
    const { data, error } = await supabase.auth.getSession();
    hasSession = Boolean(data.session?.access_token);

    if (!hasSession && isSupabaseAuthRateLimitError(error)) {
      hasSession = hasSupabaseAuthCookie(request);
    }
  } catch (error) {
    hasSession = isSupabaseAuthRateLimitError(error) && hasSupabaseAuthCookie(request);
  }

  const sessionRedirectPath = getSessionRedirectPath({
    hasSession,
    isAuthRoute,
    isProtectedRoute
  });

  if (sessionRedirectPath) {
    const url = request.nextUrl.clone();
    url.pathname = sessionRedirectPath;
    url.search = "";
    return redirectPreservingCookies(url, response);
  }

  return response;
}
