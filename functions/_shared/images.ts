export type StoredListingImage = {
  id: string;
  data_url?: string | null;
  r2_key?: string | null;
};

export function getListingImageUrl(image: Pick<StoredListingImage, "id" | "r2_key">): string {
  if (image.r2_key) {
    return `/api/images/${encodeURIComponent(image.r2_key)}`;
  }

  return `/api/listing-images/${encodeURIComponent(image.id)}`;
}

export function getListingImageRouteId(value: string): string | undefined {
  return getRouteValue(value, "/api/listing-images/");
}

export function getR2ImageRouteKey(value: string): string | undefined {
  return getRouteValue(value, "/api/images/");
}

export function parseDataUrl(dataUrl: string): { contentType: string; bytes: Uint8Array } | undefined {
  const match = dataUrl.match(/^data:([^,]*),(.*)$/s);
  if (!match) return undefined;

  const metadata = match[1] || "text/plain;charset=US-ASCII";
  const metadataParts = metadata.split(";").filter(Boolean);
  const isBase64 = metadataParts.includes("base64");
  const contentType = metadataParts.filter((part) => part !== "base64").join(";") || "text/plain;charset=US-ASCII";

  if (isBase64) {
    const binary = atob(match[2].replace(/\s/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return { contentType, bytes };
  }

  try {
    return {
      contentType,
      bytes: new TextEncoder().encode(decodeURIComponent(match[2]))
    };
  } catch {
    return {
      contentType,
      bytes: new TextEncoder().encode(match[2])
    };
  }
}

function getRouteValue(value: string, prefix: string): string | undefined {
  const path = getPathname(value);
  if (!path.startsWith(prefix)) return undefined;
  return safeDecodeURIComponent(path.slice(prefix.length));
}

function getPathname(value: string): string {
  if (value.startsWith("http://") || value.startsWith("https://")) {
    try {
      return new URL(value).pathname;
    } catch {
      return value;
    }
  }

  return value.split(/[?#]/, 1)[0];
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
