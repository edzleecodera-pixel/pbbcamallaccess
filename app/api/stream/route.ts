import { getChannel } from "@/lib/channels";
import { buildPsshBase64 } from "@/lib/dash";
import { upstreamHeaders, MANIFEST_ACCEPT } from "@/lib/upstream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const preferredRegion = ["sin1"];

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const channel = getChannel(url.searchParams.get("channel") || "");

  if (!channel) {
    return Response.json({ error: "unknown channel" }, { status: 404 });
  }

  const requestedProxy = url.searchParams.get("proxy") === "1";
  const proxied = `/api/proxy/stream/${channel.id}/manifest.mpd`;

  let useProxy = requestedProxy;

  if (!useProxy) {
    try {
      const probe = await fetch(`${channel.upstreamBase}manifest.mpd`, {
        headers: upstreamHeaders(MANIFEST_ACCEPT),
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      if (!probe.ok) useProxy = true;
    } catch {
      useProxy = true;
    }
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
      baseUrl: useProxy
        ? `/api/proxy/stream/${channel.id}/`
        : channel.upstreamBase,
      degraded: useProxy,
      pssh: buildPsshBase64(channel.keyId),
    },
    { headers: { "cache-control": "no-store" } }
  );
}
