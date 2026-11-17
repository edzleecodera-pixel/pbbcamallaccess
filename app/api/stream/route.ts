import { getChannel } from "@/lib/channels";
import { buildPsshBase64 } from "@/lib/dash";
import { fetchWithVariants, MANIFEST_ACCEPT } from "@/lib/upstream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const preferredRegion = ["sin1", "hkg1"];

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const channel = getChannel(url.searchParams.get("channel") || "");

  if (!channel) return Response.json({ error: "unknown channel" }, { status: 404 });

  const proxied = `/api/proxy/stream/${channel.id}/manifest.mpd`;
  const requestedProxy = url.searchParams.get("proxy") === "1";

  let useProxy = requestedProxy;

  // Probe: only route segments direct if the browser will actually be allowed.
  if (!useProxy) {
    const probe = await fetchWithVariants(
      `${channel.upstreamBase}manifest.mpd`,
      MANIFEST_ACCEPT,
      5000
    );
    if (!probe || !probe.ok) useProxy = true;
    else if (!/<MPD[\s>]/i.test(await probe.text())) useProxy = true;
  }

  return Response.json(
    {
      channelId: channel.id,
      keyId: channel.keyId,
      key: channel.key,
      requiresDrm: channel.requiresDrm,
      drmMode: channel.drmMode,
      clearKeys: channel.requiresDrm ? { [channel.keyId]: channel.key } : {},
      ClearKey: { k1: channel.keyId, k2: channel.key },
      manifestUri: `${proxied}?proxy=${useProxy ? 1 : 0}&t=${Date.now()}`,
      proxiedManifestUri: `${proxied}?proxy=1&t=${Date.now()}`,
      baseUrl: useProxy ? `/api/proxy/stream/${channel.id}/` : channel.upstreamBase,
      degraded: useProxy,
      pssh: buildPsshBase64(channel.keyId),
    },
    { headers: { "cache-control": "no-store" } }
  );
}
