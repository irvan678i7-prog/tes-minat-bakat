import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const u = getAdminFromRequest(req);
  if (!u) return NextResponse.json({ user: null }, { status: 200 });
  return NextResponse.json({ user: { email: u.email, id: u.sub } });
}
