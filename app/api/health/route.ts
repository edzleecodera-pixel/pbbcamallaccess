import { CHANNELS } from "@/lib/channels";
import { headerVariants, MANIFEST_ACCEPT, SOURCE_PROXY } from "@/lib/upstream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = ["sin1", "hkg1"];

export async function GET(): Promise<Response> {
  const channel = CHANNELS[0];
  const target = `${channel.upstreamBase}manifest.mpd`;
  const results: any[] = [];
  const variants = headerVariants(MANIFEST_ACCEPT);

  for (let i = 0; i < variants.length; i++) {
    try {
      const res = await fetch(target, {
        headers: variants[i],
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      const body = res.ok ? await res.text() : "";
      const isManifest = /<MPD[\s>]/i.test(body);
      results.push({ variant: i, status: res.status, isManifest });
      if (res.ok && isManifest) {
        return Response.json(
          { ok: true, workingVariant: i, results },
          { headers: { "cache-control": "no-store" } }
        );
      }
    } catch (error: any) {
      results.push({ variant: i, status: 0, error: error?.name || "failed" });
    }
  }

  try {
    const res = await fetch(`${SOURCE_PROXY}/${channel.id}/manifest.mpd`, {
      headers: variants[0],
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    results.push({ variant: "source-proxy", status: res.status });
    if (res.ok) {
      return Response.json(
        { ok: true, workingVariant: "source-proxy", results },
        { headers: { "cache-control": "no-store" } }
      );
    }
  } catch {
    results.push({ variant: "source-proxy", status: 0 });
  }

  return Response.json({ ok: false, results }, { status: 503, headers: { "cache-control": "no-store" } });
}
