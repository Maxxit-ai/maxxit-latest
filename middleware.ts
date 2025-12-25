import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * CORS Middleware for API routes
 * Allows cross-origin requests from configured origins
 */

// Allowed origins for CORS
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
  "http://localhost:3003",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  "http://127.0.0.1:3002",
  "http://127.0.0.1:3003",
  // Add your production domains here
  process.env.NEXT_PUBLIC_OSTIUM_FRONTEND_URL,
  process.env.NEXT_PUBLIC_APP_URL,
].filter(Boolean) as string[];

export function middleware(request: NextRequest) {
  // Only apply CORS to API routes
  if (!request.nextUrl.pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  const origin = request.headers.get("origin");

  // Check if the origin is allowed
  const isAllowedOrigin =
    origin &&
    (allowedOrigins.includes(origin) ||
      origin.endsWith(".ngrok-free.app") ||
      origin.endsWith(".vercel.app"));

  // Handle preflight OPTIONS request
  if (request.method === "OPTIONS") {
    const response = new NextResponse(null, { status: 200 });

    if (isAllowedOrigin) {
      response.headers.set("Access-Control-Allow-Origin", origin);
    } else {
      // Allow all origins in development, be more restrictive in production
      response.headers.set("Access-Control-Allow-Origin", "*");
    }

    response.headers.set(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, PATCH, OPTIONS"
    );
    response.headers.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Requested-With, ngrok-skip-browser-warning"
    );
    response.headers.set("Access-Control-Max-Age", "86400");

    return response;
  }

  // Handle actual request
  const response = NextResponse.next();

  if (isAllowedOrigin) {
    response.headers.set("Access-Control-Allow-Origin", origin);
  } else {
    // Allow all origins in development
    response.headers.set("Access-Control-Allow-Origin", "*");
  }

  response.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, PATCH, OPTIONS"
  );
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, ngrok-skip-browser-warning"
  );

  return response;
}

// Configure which paths the middleware runs on
export const config = {
  matcher: "/api/:path*",
};
