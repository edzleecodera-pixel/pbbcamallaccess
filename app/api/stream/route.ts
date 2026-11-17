import { getChannel } from "@/lib/channels";
import { patchManifest, buildPsshBase64 } from "@/lib/dash";
import { upstreamHeaders, MANIFEST_ACCEPT } from "@/lib/upstream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = ["sin1"];

export async function GET(request: Request): Promise<Response> {
  const channelId = new URL(request.url).searchParams.get("channel") || "";
  const channel = getChannel(channelId);

  if (!channel) {
    return Response.json({ error: "unknown channel" }, { status: 404 });
  }

  const direct = `${channel.upstreamBase}manifest.mpd`;
  const proxied = `/api/proxy/stream/${channel.id}/manifest.mpd`;

  const base = {
    channelId: channel.id,
    keyId: channel.keyId,
    key: channel.key,
    requiresDrm: channel.requiresDrm,
    drmMode: channel.drmMode,
    clearKeys: channel.requiresDrm
      ? { [channel.keyId]: channel.key }
      : {},
    ClearKey: { k1: channel.keyId, k2: channel.key },
    directManifestUri: direct,
    proxiedManifestUri: proxied,
  };

  try {
    const upstream = await fetch(direct, {
      headers: upstreamHeaders(MANIFEST_ACCEPT),
      cache: "no-store",
      signal: AbortSignal.timeout(7000),
    });

    if (!upstream.ok) throw new Error(`upstream ${upstream.status}`);

    const xml = await upstream.text();
    if (!/<MPD[\s>]/i.test(xml)) throw new Error("not a manifest");

    const patched = patchManifest(xml, {
      baseUrl: channel.upstreamBase,
      keyId: channel.keyId,
    });

    const dataUri =
      "data:application/dash+xml;charset=utf-8;base64," +
      Buffer.from(patched, "utf8").toString("base64");

    return Response.json(
      {
        ...base,
        manifestUri: dataUri,
        baseUrl: channel.upstreamBase,
        degraded: false,
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch {
    return Response.json(
      {
        ...base,
        manifestUri: `${proxied}?t=${Date.now()}`,
        baseUrl: `/api/proxy/stream/${channel.id}/`,
        degraded: true,
        pssh: buildPsshBase64(channel.keyId),
      },
      { headers: { "cache-control": "no-store" } }
    );
  }
}
