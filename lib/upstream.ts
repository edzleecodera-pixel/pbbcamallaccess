export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export const upstreamHeaders = (accept = "*/*") => ({
  "user-agent": process.env.UPSTREAM_UA || BROWSER_UA,
  referer: process.env.UPSTREAM_REFERER || "https://pbb3collablive.xyz/",
  origin: process.env.UPSTREAM_ORIGIN || "https://pbb3collablive.xyz",
  accept,
  "accept-language": "en-US,en;q=0.9",
});

export const MANIFEST_ACCEPT =
  "application/dash+xml,application/xml;q=0.9,text/xml;q=0.8,*/*;q=0.7";
