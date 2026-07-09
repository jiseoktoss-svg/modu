import { createHash } from "crypto";

const IP_HASH_NAMESPACE = "modu-tracking-ip-v1";
const IP_HEADER_NAMES = [
  "x-forwarded-for",
  "x-real-ip",
  "cf-connecting-ip",
  "true-client-ip",
  "x-client-ip",
] as const;

export function clientIpHashFromHeaders(headers: Headers): string | null {
  const ip = clientIpFromHeaders(headers);
  if (!ip) return null;

  return createHash("sha256")
    .update(`${IP_HASH_NAMESPACE}:${ip}`)
    .digest("hex");
}

export function clientIpFromHeaders(headers: Headers): string | null {
  for (const name of IP_HEADER_NAMES) {
    const value = headers.get(name);
    const ip = firstIpFromHeaderValue(value);
    if (ip) return ip;
  }

  return null;
}

function firstIpFromHeaderValue(value: string | null): string | null {
  if (!value) return null;

  for (const part of value.split(",")) {
    const ip = normalizeIp(part);
    if (ip) return ip;
  }

  return null;
}

function normalizeIp(value: string): string | null {
  const trimmed = value.trim().replace(/^"|"$/g, "");
  if (!trimmed || trimmed.toLowerCase() === "unknown") return null;

  const bracketedIpv6 = trimmed.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketedIpv6) return bracketedIpv6[1].toLowerCase();

  const ipv4WithPort = trimmed.match(/^(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/);
  if (ipv4WithPort) return ipv4WithPort[1];

  return trimmed.toLowerCase();
}
