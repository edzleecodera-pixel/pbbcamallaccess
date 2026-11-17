import { patchManifest, normHex } from "./dash";

let shakaPromise: Promise<any> | null = null;

export function loadShaka(): Promise<any> {
  if (!shakaPromise) {
    shakaPromise = import("shaka-player").then((mod: any) => {
      const shaka = mod.default || mod;
      shaka.polyfill.installAll();
      return shaka;
    });
  }
  return shakaPromise;
}

export function toU8(input: any): Uint8Array {
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer as ArrayBuffer, input.byteOffset, input.byteLength);
  }
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return new Uint8Array(0);
}

const boxType = (d: Uint8Array, o: number): string =>
  String.fromCharCode(d[o], d[o + 1], d[o + 2], d[o + 3]);

const setBoxType = (d: Uint8Array, o: number, v: string): void => {
  for (let i = 0; i < 4; i++) d[o + i] = v.charCodeAt(i);
};

const hexToBytes = (hex: string): Uint8Array => {
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) out[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  return out;
};

export function patchInitSegment(data: Uint8Array, keyId: string): void {
  const hex = normHex(keyId);
  if (!data || data.byteLength < 64 || hex.length !== 32) return;

  const kid = hexToBytes(hex);
  let original: Uint8Array | null = null;

  for (let i = 0; i + 28 <= data.byteLength; i++) {
    if (boxType(data, i) === "tenc") {
      original = data.slice(i + 12, i + 28);
      data.set(kid, i + 12);
    }
  }

  const view = new DataView(data.buffer as ArrayBuffer, data.byteOffset, data.byteLength);

  const walk = (start: number, end: number): void => {
    let c = start;
    while (c + 8 <= end) {
      let size = view.getUint32(c, false);
      const type = boxType(data, c + 4);
      if (size === 0) size = end - c;
      if (size < 8 || c + size > end) break;

      if (type === "pssh") {
        const rest = size - 52;
        if (size === 52 || rest >= 8) {
          view.setUint32(c, 52, false);
          setBoxType(data, c + 4, "free");
          view.setUint32(c + 8, 0x01000000, false);
          data.set(hexToBytes("1077efecc0b24d02ace33c1e52e2fb4b"), c + 12);
          view.setUint32(c + 28, 1, false);
          data.set(kid, c + 32);
          view.setUint32(c + 48, 0, false);
          if (rest >= 8) {
            view.setUint32(c + 52, rest, false);
            setBoxType(data, c + 56, "free");
            data.fill(0, c + 60, c + size);
          }
        }
      } else if (type === "moov") {
        walk(c + 8, c + size);
      }
      c += size;
    }
  };

  walk(0, data.byteLength);

  if (original) {
    for (let i = 0; i + 16 <= data.byteLength; i++) {
      let hit = true;
      for (let k = 0; k < 16; k++) {
        if (data[i + k] !== original[k]) { hit = false; break; }
      }
      if (hit) { data.set(kid, i); i += 15; }
    }
  }
}

export function patchMediaSegment(data: Uint8Array): void {
  if (!data || data.byteLength < 32) return;

  const view = new DataView(data.buffer as ArrayBuffer, data.byteOffset, data.byteLength);
  let c = 0;

  while (c + 8 <= data.byteLength) {
    let size = view.getUint32(c, false);
    const type = boxType(data, c + 4);
    if (size === 0) size = data.byteLength - c;
    if (size < 8 || c + size > data.byteLength) break;

    if (type === "moof") {
      const end = c + size;
      let inner = c + 8;
      while (inner + 8 <= end) {
        let innerSize = view.getUint32(inner, false);
        const innerType = boxType(data, inner + 4);
        if (innerSize === 0) innerSize = end - inner;
        if (innerSize < 8 || inner + innerSize > end) break;
        if (innerType === "pssh") {
          setBoxType(data, inner + 4, "free");
          data.fill(0, inner + 8, inner + innerSize);
        }
        inner += innerSize;
      }
    }
    c += size;
  }
}

export type FilterContext = { baseUrl: string; keyId: string };

/** Injects BaseURL + ClearKey pssh into whatever manifest was loaded, and
 *  rewrites tenc/pssh boxes in init segments. Works for direct Akamai loads. */
export function installFilters(player: any, shaka: any, ctx: FilterContext): void {
  const engine = player.getNetworkingEngine();
  if (!engine) return;

  const RequestType = shaka.net.NetworkingEngine.RequestType;

  engine.registerResponseFilter((requestType: any, response: any) => {
    if (!response || !response.data) return;

    if (requestType === RequestType.MANIFEST) {
      try {
        const text = new TextDecoder().decode(toU8(response.data));
        response.data = new TextEncoder().encode(
          patchManifest(text, { baseUrl: ctx.baseUrl, keyId: ctx.keyId })
        ).buffer;
      } catch {
        /* ignore */
      }
      return;
    }

    if (requestType === RequestType.SEGMENT) {
      try {
        const bytes = toU8(response.data);
        const uri = String(response.uri || response.originalUri || "");
        if (uri.indexOf("_init.mp4") !== -1) patchInitSegment(bytes, ctx.keyId);
        else patchMediaSegment(bytes);
        response.data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      } catch {
        /* ignore */
      }
    }
  });
}
