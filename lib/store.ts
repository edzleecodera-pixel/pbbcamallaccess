const CUTOFF_MS = 45_000;
const KEY = "pbb:viewers";

const memory = new Map<string, number>();

function redis(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token };
}

async function command(...args: (string | number)[]): Promise<any | null> {
  const config = redis();
  if (!config) return null;

  try {
    const res = await fetch(
      `${config.url}/${args.map((a) => encodeURIComponent(String(a))).join("/")}`,
      { headers: { authorization: `Bearer ${config.token}` }, cache: "no-store" }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function touch(sid: string): Promise<void> {
  const now = Date.now();
  const written = await command("ZADD", KEY, now, sid);

  if (written) {
    await command("ZREMRANGEBYSCORE", KEY, 0, now - CUTOFF_MS);
    return;
  }

  memory.set(sid, now);
  for (const [id, seen] of memory) if (now - seen > CUTOFF_MS) memory.delete(id);
}

export async function count(): Promise<number> {
  const now = Date.now();
  const pruned = await command("ZREMRANGEBYSCORE", KEY, 0, now - CUTOFF_MS);

  if (pruned) {
    const card = await command("ZCARD", KEY);
    if (card && typeof card.result === "number") return card.result;
  }

  for (const [id, seen] of memory) if (now - seen > CUTOFF_MS) memory.delete(id);
  return memory.size;
}
