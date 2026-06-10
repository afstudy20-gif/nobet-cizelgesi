import { NextResponse } from "next/server";
import { backfillMissingLocationAccess } from "@/lib/person-location-defaults";

export async function POST() {
  try {
    const created = await backfillMissingLocationAccess();
    return NextResponse.json({ created });
  } catch (err) {
    console.error("[POST /api/people/backfill-location-access]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 }
    );
  }
}