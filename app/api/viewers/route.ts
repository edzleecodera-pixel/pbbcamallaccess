import { count } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = ["sin1"];

export async function GET(): Promise<Response> {
  const live = await count();
  return Response.json(
    { count: live },
    { headers: { "cache-control": "no-store" } }
  );
}
