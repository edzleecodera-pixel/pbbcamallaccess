import { patchManifest, normHex } from "./dash";

let shakaPromise: Promise<any> | null = null;

export async function loadShaka(): Promise<any> {
  if (!shakaPromise) {
    shakaPromise = import("shaka-player/dist/shaka-player.compiled.js").then((m: any) => {
      const s = m.default || m;
      s.polyfill.installAll();
      return s;
    });
  }
  return shakaPromise;
}

export const toU8 = (d: any): Uint8Array =>
  ArrayBuffer.isView(d)
    ? new Uint8Array(d.buffer, d.byteOffset, d.byteLength)
    : new Uint8Array(d instanceof ArrayBuffer ? d : 0);

const type = (d: Uint8Array, o: number) =>
  String.fromCharCode(d[o], d[o + 1], d[o + 2], d[o + 3]);

const setType = (d: Uint8Array, o: number, t: string) => {
  for (let i = 0; i < 4; i++) d[o + i] = t.charCodeAt(i);
};

const hexBytes = (hex: string) => {
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) out[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  return out;
};

/** Rewrite the `tenc` default KID and neutralise embedded pssh boxes in an init segment. */
export function patchInitSegment(data: Uint8Array, keyId: string) {
  const hex = normHex(keyId);
  if (!data || data.byteLength < 64 || hex.length !== 32) return;
  const kid = hexBytes(hex);
  let original: Uint8Array | null = null;
  for (let i = 0; i + 28 <= data.byteLength; i++) {
    if (type(data, i) === "tenc") {
      original = data.slice(i + 12, i + 28);
      data.set(kid, i + 12);
    }
  }
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const walk = (start: number, end: number) => {
    let p = start;
    while (p + 8 <= end) {
      let size = dv.getUint32(p, false);
      const t = type(data, p + 4);
      if (size === 0) size = end - p;
      if (size < 8 || p + size > end) break;
      if (t === "pssh") {
        const rest = size - 52;
        if (size === 52 || rest >= 8) {
          dv.setUint32(p, 52, false);
          setType(data, p + 4, "free");
          dv.setUint32(p + 8, 0x01000000, false);
          data.set(hexBytes("1077efecc0b24d02ace33c1e52e2fb4b"), p + 12);
          dv.setUint32(p + 28, 1, false);
          data.set(kid, p + 32);
          dv.setUint32(p + 48, 0, false);
          if (rest >= 8) {
            dv.setUint32(p + 52, rest, false);
            setType(data, p + 56, "free");
            data.fill(0, p + 60, p + size);
          }
        }
      } else if (t === "moov") walk(p + 8, p + size);
      p += size;
    }
  };
  walk(0, data.byteLength);
  if (original) {
    for (let i = 0; i + 16 <= data.byteLength; i++) {
      let hit = true;
      for (let k = 0; k < 16; k++) if (data[i + k] !== original[k]) { hit = false; break; }
      if (hit) { data.set(kid, i); i += 15; }
    }
  }
}

/** Neutralise pssh boxes inside a media segment's moof. */
export function patchMediaSegment(data: Uint8Array) {
  if (!data || data.byteLength < 32) return;
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let p = 0;
  while (p + 8 <= data.byteLength) {
    let size = dv.getUint32(p, false);
    const t = type(data, p + 4);
    if (size === 0) size = data.byteLength - p;
    if (size < 8 || p + size > data.byteLength) break;
    if (t === "moof") {
      const end = p + size;
      let q = p + 8;
      while (q + 8 <= end) {
        let s2 = dv.getUint32(q, false);
        const t2 = type(data, q + 4);
        if (s2 === 0) s2 = end - q;
        if (s2 < 8 || q + s2 > end) break;
        if (t2 === "pssh") { setType(data, q + 4, "free"); data.fill(0, q + 8, q + s2); }
        q += s2;
      }
    }
    p += size;
  }
}

/** Response filter: keeps manifest/segment patching as a client-side safety net. */
export function installFilters(player: any, shaka: any, info: any) {
  const net = player.getNetworkingEngine();
  if (!net) return;
  const RT = shaka.net.NetworkingEngine.RequestType;
  net.registerResponseFilter(async (reqType: any, res: any) => {
    if (!res?.data) return;
    if (reqType === RT.MANIFEST) {
      try {
        const text = new TextDecoder().decode(toU8(res.data));
        res.data = new TextEncoder().encode(
          patchManifest(text, { baseUrl: info.baseUrl, keyId: info.keyId })
        ).buffer;
      } catch { /* ignore */ }
      return;
    }
    if (reqType === RT.SEGMENT) {
      try {
        const u8 = toU8(res.data);
        const uri = String(res.uri || res.originalUri || "");
        if (uri.includes("_init.mp4")) patchInitSegment(u8, info.keyId);
        else patchMediaSegment(u8);
        res.data = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
      } catch { /* ignore */ }
    }
  });
}
