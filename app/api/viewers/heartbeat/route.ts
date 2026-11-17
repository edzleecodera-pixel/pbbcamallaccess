import { touch } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = ["sin1"];

export async function POST(request: Request): Promise<Response> {
  let sid = "";
  try {
    const body = await request.json();
    sid = typeof body?.sid === "string" ? body.sid.slice(0, 64) : "";
  } catch {
    sid = "";
  }

  if (!sid) return Response.json({ ok: false }, { status: 400 });

  await touch(sid);
  return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
