import { getChannel } from "@/lib/channels";
import { upstreamHeaders, MANIFEST_ACCEPT } from "@/lib/upstream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = ["sin1"];

function cacheControl(path: string): string {
  if (path.endsWith(".mpd")) return "public, s-maxage=2, stale-while-revalidate=10";
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

  const relative = (path || [])
    .map((segment) => segment.replace(/\.\./g, ""))
    .join("/");
  if (!relative) return new Response("missing path", { status: 400 });

  const target = new URL(channel.upstreamBase + relative);
  new URL(request.url).searchParams.forEach((value, key) => {
    if (key !== "t") target.searchParams.set(key, value);
  });

  const isManifest = relative.endsWith(".mpd");

  try {
    const upstream = await fetch(target.toString(), {
      headers: upstreamHeaders(isManifest ? MANIFEST_ACCEPT : "*/*"),
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });

    if (!upstream.ok) {
      return new Response(`upstream ${upstream.status}`, {
        status: upstream.status,
      });
    }

    const headers = new Headers({
      "access-control-allow-origin": "*",
      "cache-control": cacheControl(relative),
      "content-type":
        upstream.headers.get("content-type") ||
        (isManifest ? "application/dash+xml" : "video/mp4"),
    });

    const length = upstream.headers.get("content-length");
    if (length) headers.set("content-length", length);

    return new Response(request.method === "HEAD" ? null : upstream.body, {
      status: 200,
      headers,
    });
  } catch {
    return new Response("upstream unreachable", { status: 502 });
  }
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
