const CLEARKEY_SYSTEM_ID = [
  0x10, 0x77, 0xef, 0xec, 0xc0, 0xb2, 0x4d, 0x02,
  0xac, 0xe3, 0x3c, 0x1e, 0x52, 0xe2, 0xfb, 0x4b,
];

export const normHex = (v: string) =>
  String(v || "").replace(/[^0-9a-fA-F]/g, "").toLowerCase();

const b64 = (bytes: Uint8Array): string => {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
};

export function buildPsshBox(keyId: string): Uint8Array | null {
  const hex = normHex(keyId);
  if (hex.length !== 32) return null;
  const box = new Uint8Array(52);
  const dv = new DataView(box.buffer);
  dv.setUint32(0, 52, false);
  box.set([0x70, 0x73, 0x73, 0x68], 4);
  dv.setUint32(8, 0x01000000, false);
  box.set(CLEARKEY_SYSTEM_ID, 12);
  dv.setUint32(28, 1, false);
  for (let i = 0; i < 16; i++) box[32 + i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  dv.setUint32(48, 0, false);
  return box;
}

export const buildPsshBase64 = (keyId: string) => {
  const box = buildPsshBox(keyId);
  return box ? b64(box) : null;
};

export const extractDefaultKid = (xml: string) => {
  const m = xml.match(/default_KID="([^"]+)"/i);
  const hex = m ? normHex(m[1]) : "";
  return hex.length === 32 ? hex : "";
};

/** Inject <BaseURL> and a ClearKey pssh; strip the Widevine entry. */
export function patchManifest(xml: string, opts: { baseUrl?: string; keyId?: string }) {
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
      .replace(/<ContentProtection[^>]*edef8ba9-79d6-4ace-a3c8-27dcd51d21ed[^>]*>[\s\S]*?<\/ContentProtection>/gi, "")
      .replace(/<ContentProtection[^>]*edef8ba9-79d6-4ace-a3c8-27dcd51d21ed[^>]*\/>/gi, "");
    if (pssh && !/1077efec-c0b2-4d02-ace3-3c1e52e2fb4b/i.test(out)) {
      out = out.replace(
        /(<ContentProtection[^>]*mp4protection:2011[^>]*\/>)/gi,
        `$1\n<ContentProtection schemeIdUri="urn:uuid:1077efec-c0b2-4d02-ace3-3c1e52e2fb4b" value="cenc"><cenc:pssh>${pssh}</cenc:pssh></ContentProtection>`
      );
    }
  }
  return out;
}
