import { getChannel } from "@/lib/channels";
import { upstreamHeaders, MANIFEST_ACCEPT } from "@/lib/upstream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = ["sin1"];

const cacheFor = (path: string) => {
  if (path.endsWith(".mpd")) return "public, s-maxage=2, stale-while-revalidate=10";
  if (path.includes("_init")) return "public, max-age=60, s-maxage=60";
  return "public, max-age=31536000, immutable";
};

async function handler(request: Request, ctx: { params: Promise<{ id: string; path: string[] }> }) {
  const { id, path } = await ctx.params;
  const channel = getChannel(id);
  if (!channel) return new Response("unknown channel", { status: 404 });

  const rel = (path || []).map((p) => p.replace(/\.\./g, "")).join("/");
  if (!rel) return new Response("missing path", { status: 400 });

  const upstream = new URL(channel.upstreamBase + rel);
  new URL(request.url).searchParams.forEach((v, k) => {
    if (k !== "t") upstream.searchParams.set(k, v);
  });

  const isManifest = rel.endsWith(".mpd");
  try {
    const res = await fetch(upstream.toString(), {
      headers: upstreamHeaders(isManifest ? MANIFEST_ACCEPT : "*/*"),
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return new Response(`upstream ${res.status}`, { status: res.status });

    const headers = new Headers({
      "access-control-allow-origin": "*",
      "cache-control": cacheFor(rel),
      "content-type": res.headers.get("content-type") || (isManifest ? "application/dash+xml" : "video/mp4"),
    });
    const len = res.headers.get("content-length");
    if (len) headers.set("content-length", len);

    return new Response(request.method === "HEAD" ? null : res.body, { status: 200, headers });
  } catch {
    return new Response("upstream unreachable", { status: 502 });
  }
}

export const GET = handler;
export const HEAD = handler;
