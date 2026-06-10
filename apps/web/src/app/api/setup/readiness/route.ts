import { NextResponse } from "next/server";
import { getSetupReadiness } from "@/lib/setup-readiness";

export async function GET() {
  try {
    const readiness = await getSetupReadiness();
    return NextResponse.json(readiness);
  } catch (err) {
    console.error("[GET /api/setup/readiness]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 }
    );
  }
}