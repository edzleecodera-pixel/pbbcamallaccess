import { count } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = ["sin1", "hkg1"];

export async function GET(): Promise<Response> {
  return Response.json({ count: await count() }, { headers: { "cache-control": "no-store" } });
}
