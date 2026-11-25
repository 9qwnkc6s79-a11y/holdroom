import { NextResponse, type NextRequest } from "next/server";
import { operatorUiEnabled } from "@/lib/operator";

const LEGACY_OPERATOR_PREFIXES = [
  "/status",
  "/files",
  "/admin",
  "/more",
  "/departments",
  "/sources",
  "/rooms",
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!operatorUiEnabled() && LEGACY_OPERATOR_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return new NextResponse("Not Found", { status: 404 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/status/:path*", "/files/:path*", "/admin/:path*", "/more/:path*", "/departments/:path*", "/sources/:path*", "/rooms/:path*"],
};
