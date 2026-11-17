const CLEARKEY_SYSTEM_ID = [
  0x10, 0x77, 0xef, 0xec, 0xc0, 0xb2, 0x4d, 0x02,
  0xac, 0xe3, 0x3c, 0x1e, 0x52, 0xe2, 0xfb, 0x4b,
];

export const normHex = (v: string): string =>
  String(v || "").replace(/[^0-9a-fA-F]/g, "").toLowerCase();

function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return btoa(out);
}

export function buildPsshBox(keyId: string): Uint8Array | null {
  const hex = normHex(keyId);
  if (hex.length !== 32) return null;

  const box = new Uint8Array(52);
  const view = new DataView(box.buffer as ArrayBuffer);

  view.setUint32(0, 52, false);
  box.set([0x70, 0x73, 0x73, 0x68], 4);
  view.setUint32(8, 0x01000000, false);
  box.set(CLEARKEY_SYSTEM_ID, 12);
  view.setUint32(28, 1, false);
  for (let i = 0; i < 16; i++) {
    box[32 + i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  }
  view.setUint32(48, 0, false);

  return box;
}

export function buildPsshBase64(keyId: string): string | null {
  const box = buildPsshBox(keyId);
  return box ? toBase64(box) : null;
}

export function extractDefaultKid(xml: string): string {
  const match = xml.match(/default_KID="([^"]+)"/i);
  const hex = match ? normHex(match[1]) : "";
  return hex.length === 32 ? hex : "";
}

export function patchManifest(
  xml: string,
  opts: { baseUrl?: string; keyId?: string }
): string {
  let out = String(xml || "");

  if (opts.baseUrl) {
    const url = opts.baseUrl;
    out = /<BaseURL>[\s\S]*?<\/BaseURL>/i.test(out)
      ? out.replace(/<BaseURL>[\s\S]*?<\/BaseURL>/gi, `<BaseURL>${url}</BaseURL>`)
      : out.replace(/(<MPD[^>]*>)/i, `$1\n  <BaseURL>${url}</BaseURL>`);
  }

  const kid = extractDefaultKid(out) || normHex(opts.keyId || "");

  if (kid.length === 32) {
    const pssh = buildPsshBase64(kid);

    out = out
      .replace(
        /<ContentProtection[^>]*edef8ba9-79d6-4ace-a3c8-27dcd51d21ed[^>]*>[\s\S]*?<\/ContentProtection>/gi,
        ""
      )
      .replace(
        /<ContentProtection[^>]*edef8ba9-79d6-4ace-a3c8-27dcd51d21ed[^>]*\/>/gi,
        ""
      );

    if (pssh && !/1077efec-c0b2-4d02-ace3-3c1e52e2fb4b/i.test(out)) {
      out = out.replace(
        /(<ContentProtection[^>]*mp4protection:2011[^>]*\/>)/gi,
        `$1\n<ContentProtection schemeIdUri="urn:uuid:1077efec-c0b2-4d02-ace3-3c1e52e2fb4b" value="cenc"><cenc:pssh>${pssh}</cenc:pssh></ContentProtection>`
      );
    }
  }

  return out;
}
