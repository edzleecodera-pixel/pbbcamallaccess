export type DrmMode = "clearkey" | "none";

export type Channel = {
  id: string;
  code: string;
  name: string;
  upstreamBase: string;
  keyId: string;
  key: string;
  requiresDrm: boolean;
  drmMode: DrmMode;
};

const AK = "https://absp-live.akamaized.net/dash/live/2099522/";

export const CHANNELS: Channel[] = [
  {
    id: "4f8b2c15-7d9a-4e3b-8c0d-1e3f6a5b9c22",
    code: "CAM 01",
    name: "ALL ACCESS",
    upstreamBase: `${AK}pbbcollab30allaccesslivestream/`,
    keyId: "8150b74d16324bb4b2ff62e3e202fc7a",
    key: "0c5ed4f9db9d4ee61bbc91b3a51ef8b5",
    requiresDrm: true,
    drmMode: "clearkey",
  },
  {
    id: "6a1e3f89-2c4d-4b0e-9a1c-5d7e8f3a2b44",
    code: "CAM 02",
    name: "DINING AREA",
    upstreamBase: `${AK}pbbcollab30allaccesslivestream-diningarea/`,
    keyId: "ea6588d030c94ca89925ac0c49974430",
    key: "3e6de4afee1eff8e14f9506b76ac9ee6",
    requiresDrm: true,
    drmMode: "clearkey",
  },
  {
    id: "8d2f7c34-1e5f-4a0e-8b1c-6a3e9f2d5b11",
    code: "CAM 03",
    name: "EXTERNAL DEN",
    upstreamBase: `${AK}pbbcollab30allaccesslivestream-externalden/`,
    keyId: "b750a40736a24e60b5a4f256208b92c5",
    key: "af07292597f692726dcac2bd297ddf8e",
    requiresDrm: true,
    drmMode: "clearkey",
  },
];

export const getChannel = (id: string) => CHANNELS.find((c) => c.id === id);
