/** Header details the simulation cannot know. [Guide p.15] */

export interface CarrierDetails {
  carrier: string;
  office: string;
  terminal: string;
  truck: string;
  driver: string;
  coDriver: string;
  shipper: string;
  manifest: string;
}

export const DEFAULT_CARRIER: CarrierDetails = {
  carrier: "Longhaul Logistics LLC",
  office: "1200 Commerce Street, Dallas, TX",
  terminal: "4400 Cargo Way, Fort Worth, TX",
  truck: "Tractor 4187 / Trailer 22910",
  driver: "",
  coDriver: "None",
  shipper: "General freight",
  manifest: "",
};

const KEY = "eld.carrier";

export function loadCarrier(): CarrierDetails {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_CARRIER, ...JSON.parse(raw) } : DEFAULT_CARRIER;
  } catch {
    return DEFAULT_CARRIER;
  }
}

export function saveCarrier(details: CarrierDetails) {
  try {
    localStorage.setItem(KEY, JSON.stringify(details));
  } catch {
    /* storage can be unavailable; the sheet still renders */
  }
}
