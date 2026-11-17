export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export const MANIFEST_ACCEPT =
  "application/dash+xml,application/xml;q=0.9,text/xml;q=0.8,*/*;q=0.7";

const referer = () => process.env.UPSTREAM_REFERER || "https://pbb3collablive.xyz/";
const origin = () => process.env.UPSTREAM_ORIGIN || "https://pbb3collablive.xyz";

/** Header sets tried in order. The first is a full Chrome fingerprint. */
export function headerVariants(accept: string): Record<string, string>[] {
  const ref = referer();
  const org = origin();
  const ua = process.env.UPSTREAM_UA || BROWSER_UA;

  const base: Record<string, string> = {
    "user-agent": ua,
    accept,
    "accept-language": "en-US,en;q=0.9",
    "accept-encoding": "gzip, deflate, br",
    referer: ref,
    origin: org,
    "cache-control": "no-cache",
    pragma: "no-cache",
  };

  return [
    {
      ...base,
      "sec-ch-ua": '"Chromium";v="131", "Not_A Brand";v="24"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "cross-site",
      priority: "u=1, i",
    },
    base,
    { "user-agent": ua, accept, referer: ref },
    { accept },
  ];
}

/** Original site's own proxy, used as the last resort. */
export const SOURCE_PROXY = "https://pbb3collablive.xyz/api/proxy/stream";

export async function fetchWithVariants(
  url: string,
  accept: string,
  timeoutMs: number
): Promise<Response | null> {
  for (const headers of headerVariants(accept)) {
    try {
      const res = await fetch(url, {
        headers,
        cache: "no-store",
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return res;
      if (res.status === 404) return res;
    } catch {
      /* next variant */
    }
  }
  return null;
}
