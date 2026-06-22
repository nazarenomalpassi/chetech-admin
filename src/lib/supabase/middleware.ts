import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";

import type { Database } from "@/lib/db/types";
import { getSupabasePublicKey, hasSupabaseEnv } from "@/lib/supabase/config";

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isAuthRoute = pathname.startsWith("/login");
  const isPublicRoute = pathname === "/" || (!hasSupabaseEnv() && pathname.startsWith("/admin"));
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

  const response = NextResponse.next({
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
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        }
      }
    }
  );

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user && isProtectedRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return response;
}
