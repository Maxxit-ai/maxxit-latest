import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * CORS Middleware for API routes
 * Allows cross-origin requests from configured origins
 *
 * Handles preflight OPTIONS requests and sets CORS headers on all API responses
 */

// Allowed origins for CORS - add your domains here
const allowedOrigins = [
  "https://ostium.maxxit.ai",
  "https://maxxit.ai",
  "https://www.maxxit.ai",
].filter(Boolean) as string[];

// CORS headers configuration
const corsHeaders = {
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
  "Access-Control-Allow-Headers":
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, ngrok-skip-browser-warning",
  "Access-Control-Max-Age": "86400",
};

function getCorsOrigin(
  origin: string | null,
  isAllowedOrigin: boolean
): string {
  if (isAllowedOrigin && origin) {
    return origin;
  }
  // For development or when origin is not in the allowed list,
  // return the origin if present, otherwise "*"
  return origin || "*";
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Only apply CORS to API routes
  if (!pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  const origin = request.headers.get("origin");

  // Check if the origin is allowed
  const isAllowedOrigin = !!(
    origin &&
    (allowedOrigins.includes(origin) ||
      origin.endsWith(".ngrok-free.app") ||
      origin.endsWith(".vercel.app") ||
      origin.includes("localhost"))
  );

  // Handle preflight OPTIONS request
  // CRITICAL: Must return immediately with 200 status to prevent redirects
  if (request.method === "OPTIONS") {
    const corsOrigin = getCorsOrigin(origin, isAllowedOrigin);

    return new NextResponse(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": corsOrigin,
        "Access-Control-Allow-Credentials": isAllowedOrigin ? "true" : "false",
        ...corsHeaders,
      },
    });
  }

  // Handle actual request - continue to API handler with CORS headers
  const response = NextResponse.next();
  const corsOrigin = getCorsOrigin(origin, isAllowedOrigin);

  // Set CORS headers on the response
  response.headers.set("Access-Control-Allow-Origin", corsOrigin);
  if (isAllowedOrigin) {
    response.headers.set("Access-Control-Allow-Credentials", "true");
  }

  // Set remaining CORS headers
  Object.entries(corsHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
}

// Configure which paths the middleware runs on
export const config = {
  matcher: [
    "/api/:path*",
  ],
};
