import { getChannel } from "@/lib/channels";
import { buildPsshBase64 } from "@/lib/dash";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const preferredRegion = ["sin1", "hkg1"];

export async function GET(request: Request): Promise<Response> {
  const channel = getChannel(new URL(request.url).searchParams.get("channel") || "");
  if (!channel) return Response.json({ error: "unknown channel" }, { status: 404 });

  const proxied = `/api/proxy/stream/${channel.id}/manifest.mpd`;

  return Response.json(
    {
      channelId: channel.id,
      keyId: channel.keyId,
      key: channel.key,
      requiresDrm: channel.requiresDrm,
      drmMode: channel.drmMode,
      clearKeys: channel.requiresDrm ? { [channel.keyId]: channel.key } : {},
      ClearKey: { k1: channel.keyId, k2: channel.key },
      directManifestUri: `${channel.upstreamBase}manifest.mpd`,
      manifestUri: `${proxied}?proxy=0&t=${Date.now()}`,
      proxiedManifestUri: `${proxied}?proxy=1&t=${Date.now()}`,
      upstreamBase: channel.upstreamBase,
      proxyBase: `/api/proxy/stream/${channel.id}/`,
      pssh: buildPsshBase64(channel.keyId),
    },
    { headers: { "cache-control": "no-store" } }
  );
}
