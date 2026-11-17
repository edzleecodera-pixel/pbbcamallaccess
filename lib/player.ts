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
    return new Uint8Array(
      input.buffer as ArrayBuffer,
      input.byteOffset,
      input.byteLength
    );
  }
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return new Uint8Array(0);
}

function boxType(data: Uint8Array, offset: number): string {
  return String.fromCharCode(
    data[offset],
    data[offset + 1],
    data[offset + 2],
    data[offset + 3]
  );
}

function setBoxType(data: Uint8Array, offset: number, value: string): void {
  for (let i = 0; i < 4; i++) data[offset + i] = value.charCodeAt(i);
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    out[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  }
  return out;
}

/**
 * Rewrites the `tenc` default KID in an init segment and neutralises every
 * embedded pssh box, so ClearKey lookups always resolve against our key.
 */
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

  const view = new DataView(
    data.buffer as ArrayBuffer,
    data.byteOffset,
    data.byteLength
  );

  const walk = (start: number, end: number): void => {
    let cursor = start;
    while (cursor + 8 <= end) {
      let size = view.getUint32(cursor, false);
      const type = boxType(data, cursor + 4);
      if (size === 0) size = end - cursor;
      if (size < 8 || cursor + size > end) break;

      if (type === "pssh") {
        const remainder = size - 52;
        if (size === 52 || remainder >= 8) {
          view.setUint32(cursor, 52, false);
          setBoxType(data, cursor + 4, "free");
          view.setUint32(cursor + 8, 0x01000000, false);
          data.set(hexToBytes("1077efecc0b24d02ace33c1e52e2fb4b"), cursor + 12);
          view.setUint32(cursor + 28, 1, false);
          data.set(kid, cursor + 32);
          view.setUint32(cursor + 48, 0, false);
          if (remainder >= 8) {
            view.setUint32(cursor + 52, remainder, false);
            setBoxType(data, cursor + 56, "free");
            data.fill(0, cursor + 60, cursor + size);
          }
        }
      } else if (type === "moov") {
        walk(cursor + 8, cursor + size);
      }

      cursor += size;
    }
  };

  walk(0, data.byteLength);

  if (original) {
    for (let i = 0; i + 16 <= data.byteLength; i++) {
      let match = true;
      for (let k = 0; k < 16; k++) {
        if (data[i + k] !== original[k]) {
          match = false;
          break;
        }
      }
      if (match) {
        data.set(kid, i);
        i += 15;
      }
    }
  }
}

/** Neutralises pssh boxes inside a media segment's moof. */
export function patchMediaSegment(data: Uint8Array): void {
  if (!data || data.byteLength < 32) return;

  const view = new DataView(
    data.buffer as ArrayBuffer,
    data.byteOffset,
    data.byteLength
  );

  let cursor = 0;
  while (cursor + 8 <= data.byteLength) {
    let size = view.getUint32(cursor, false);
    const type = boxType(data, cursor + 4);
    if (size === 0) size = data.byteLength - cursor;
    if (size < 8 || cursor + size > data.byteLength) break;

    if (type === "moof") {
      const end = cursor + size;
      let inner = cursor + 8;
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

    cursor += size;
  }
}

/** Client-side safety net that mirrors the server-side manifest/segment work. */
export function installFilters(player: any, shaka: any, info: any): void {
  const engine = player.getNetworkingEngine();
  if (!engine) return;

  const RequestType = shaka.net.NetworkingEngine.RequestType;

  engine.registerResponseFilter((requestType: any, response: any) => {
    if (!response || !response.data) return;

    if (requestType === RequestType.MANIFEST) {
      try {
        const text = new TextDecoder().decode(toU8(response.data));
        response.data = new TextEncoder().encode(
          patchManifest(text, { baseUrl: info.baseUrl, keyId: info.keyId })
        ).buffer;
      } catch {
        /* leave untouched */
      }
      return;
    }

    if (requestType === RequestType.SEGMENT) {
      try {
        const bytes = toU8(response.data);
        const uri = String(response.uri || response.originalUri || "");
        if (uri.indexOf("_init.mp4") !== -1) {
          patchInitSegment(bytes, info.keyId);
        } else {
          patchMediaSegment(bytes);
        }
        response.data = bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength
        );
      } catch {
        /* leave untouched */
      }
    }
  });
}
