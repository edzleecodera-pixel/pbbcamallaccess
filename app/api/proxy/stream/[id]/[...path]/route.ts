import { getChannel } from "@/lib/channels";
import { patchManifest } from "@/lib/dash";
import { fetchWithVariants, SOURCE_PROXY, MANIFEST_ACCEPT } from "@/lib/upstream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const preferredRegion = ["sin1", "hkg1"];

function cacheControl(path: string): string {
  if (path.endsWith(".mpd")) return "no-store";
  if (path.indexOf("_init") !== -1) return "public, max-age=60, s-maxage=60";
  return "public, max-age=31536000, immutable";
}

async function resolve(
  request: Request,
  ctx: { params: Promise<{ id: string; path: string[] }> }
): Promise<Response> {
  const { id, path } = await ctx.params;

  const channel = getChannel(id);
  if (!channel) return new Response("unknown channel", { status: 404 });

  const relative = (path || []).map((s) => s.replace(/\.\./g, "")).join("/");
  if (!relative) return new Response("missing path", { status: 400 });

  const url = new URL(request.url);
  const proxySegments = url.searchParams.get("proxy") === "1";
  const isManifest = relative.endsWith(".mpd");
  const accept = isManifest ? MANIFEST_ACCEPT : "*/*";
  const timeout = isManifest ? 6000 : 15000;

  const query = new URLSearchParams();
  url.searchParams.forEach((value, key) => {
    if (key !== "t" && key !== "proxy") query.set(key, value);
  });
  const suffix = query.toString() ? `?${query.toString()}` : "";

  let upstream = await fetchWithVariants(
    `${channel.upstreamBase}${relative}${suffix}`,
    accept,
    timeout
  );

  if (!upstream) {
    upstream = await fetchWithVariants(`${SOURCE_PROXY}/${channel.id}/${relative}${suffix}`, accept, timeout);
  }

  if (!upstream) return new Response("upstream unreachable", { status: 502 });
  if (!upstream.ok) return new Response(`upstream ${upstream.status}`, { status: upstream.status });

  if (isManifest) {
    const xml = await upstream.text();
    if (!/<MPD[\s>]/i.test(xml)) return new Response("not a manifest", { status: 502 });

    const body = patchManifest(xml, {
      baseUrl: proxySegments ? `/api/proxy/stream/${channel.id}/` : channel.upstreamBase,
      keyId: channel.keyId,
    });

    return new Response(body, {
      status: 200,
      headers: {
        "access-control-allow-origin": "*",
        "content-type": "application/dash+xml; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  // No content-length: undici decompresses the body, so the upstream value
  // would describe the compressed size and truncate the segment.
  return new Response(request.method === "HEAD" ? null : upstream.body, {
    status: 200,
    headers: {
      "access-control-allow-origin": "*",
      "cache-control": cacheControl(relative),
      "content-type": upstream.headers.get("content-type") || "video/mp4",
    },
  });
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string; path: string[] }> }
): Promise<Response> {
  return resolve(request, ctx);
}

export async function HEAD(
  request: Request,
  ctx: { params: Promise<{ id: string; path: string[] }> }
): Promise<Response> {
  return resolve(request, ctx);
}
