type ParsedRange = { offset: number; length: number };

export function parseSingleByteRange(value: string | null, size: number): ParsedRange | null | "invalid" {
  if (!value) return null;
  if (!value.startsWith("bytes=") || value.includes(",")) return "invalid";
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2]) || size <= 0) return "invalid";
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return "invalid";
    const length = Math.min(suffix, size);
    return { offset: size - length, length };
  }
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start < 0 || start >= size || requestedEnd < start) return "invalid";
  const end = Math.min(requestedEnd, size - 1);
  return { offset: start, length: end - start + 1 };
}

function metadataHeaders(object: R2Object, cacheControl: string) {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", cacheControl);
  headers.set("Content-Length", String(object.size));
  return headers;
}

export async function respondWithR2Object(bucket: R2Bucket, key: string, request: Request, cacheControl: string): Promise<Response | null> {
  const rangeHeader = request.headers.get("range");
  if (request.method === "HEAD" || rangeHeader) {
    const head = await bucket.head(key);
    if (!head) return null;
    const headers = metadataHeaders(head, cacheControl);
    if (request.method === "HEAD") return new Response(null, { status: 200, headers });
    const range = parseSingleByteRange(rangeHeader, head.size);
    if (range === "invalid" || !range) {
      headers.set("Content-Range", `bytes */${head.size}`);
      headers.set("Content-Length", "0");
      return new Response(null, { status: 416, headers });
    }
    const object = await bucket.get(key, { range });
    if (!object || !("body" in object)) return null;
    object.writeHttpMetadata(headers);
    headers.set("Content-Range", `bytes ${range.offset}-${range.offset + range.length - 1}/${head.size}`);
    headers.set("Content-Length", String(range.length));
    return new Response(object.body, { status: 206, headers });
  }

  const object = await bucket.get(key);
  if (!object || !("body" in object)) return null;
  return new Response(object.body, { status: 200, headers: metadataHeaders(object, cacheControl) });
}
