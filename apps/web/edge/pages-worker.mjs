const PUBLIC_ROUTE = /^\/@([^/]+)(?:\/(oc|post)\/([^/]+))?\/?$/;

export function parsePublicPath(pathname) {
  const match = PUBLIC_ROUTE.exec(pathname);
  if (!match) return null;
  try {
    const username = decodeURIComponent(match[1]);
    const id = match[3] ? decodeURIComponent(match[3]) : undefined;
    if (!username || username.length > 20 || (id && id.length > 160)) return null;
    return { username, kind: match[2] || undefined, id };
  } catch { return null; }
}

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const managedTags = [
  /<title>[\s\S]*?<\/title>/gi,
  /<meta\s+name=["']description["'][^>]*>/gi,
  /<meta\s+name=["']robots["'][^>]*>/gi,
  /<meta\s+property=["']og:[^"']+["'][^>]*>/gi,
  /<meta\s+name=["']twitter:[^"']+["'][^>]*>/gi,
  /<link\s+rel=["']canonical["'][^>]*>/gi,
];

export function injectMetadata(html, metadata, requestUrl) {
  const origin = new URL(requestUrl).origin;
  const canonical = new URL(metadata.canonicalPath, origin).toString();
  const image = metadata.image || new URL("/og-default.svg", origin).toString();
  const tags = [
    `<title>${escapeHtml(metadata.title)}</title>`,
    `<meta name="description" content="${escapeHtml(metadata.description)}" />`,
    `<meta name="robots" content="${escapeHtml(metadata.robots)}" />`,
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${escapeHtml(metadata.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(metadata.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
    `<meta property="og:image" content="${escapeHtml(image)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(metadata.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(metadata.description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
  ].join("\n    ");
  const clean = managedTags.reduce((value, pattern) => value.replace(pattern, ""), html);
  // A replacer function: a plain replacement string would interpret `$&`, `$'` and "$`" inside authored titles.
  return clean.replace("</head>", () => `    ${tags}\n  </head>`);
}

async function readRuntimeConfig(request, env) {
  if (typeof env.API_URL === "string" && /^https?:\/\//.test(env.API_URL)) return env.API_URL.replace(/\/$/, "");
  const configRequest = new Request(new URL("/runtime-config.json", request.url), { method: "GET" });
  const response = await env.ASSETS.fetch(configRequest);
  if (!response.ok) throw new Error("runtime config unavailable");
  const config = await response.json();
  if (!config || typeof config.apiUrl !== "string" || !/^https?:\/\//.test(config.apiUrl)) throw new Error("runtime API URL invalid");
  return config.apiUrl.replace(/\/$/, "");
}

function notFound() {
  return new Response("<!doctype html><html lang=\"zh-Hant\"><head><meta charset=\"utf-8\"><meta name=\"robots\" content=\"noindex,nofollow\"><title>找不到公開頁面 — Retro Desktop</title></head><body><main><h1>找不到公開頁面</h1><p>內容不存在或尚未發布。</p><a href=\"/\">回到 Retro Desktop</a></main></body></html>", {
    status: 404,
    headers: { "Content-Type": "text/html; charset=UTF-8", "Cache-Control": "no-store" },
  });
}

export async function handleRequest(request, env, fetchImpl = fetch) {
  const route = parsePublicPath(new URL(request.url).pathname);
  if (!route || !["GET", "HEAD"].includes(request.method)) return env.ASSETS.fetch(request);
  try {
    const apiUrl = await readRuntimeConfig(request, env);
    const endpoint = new URL(`/api/public/sites/${encodeURIComponent(route.username)}/metadata`, apiUrl);
    if (route.kind && route.id) { endpoint.searchParams.set("kind", route.kind); endpoint.searchParams.set("id", route.id); }
    const metadataResponse = await fetchImpl(endpoint, { headers: { Accept: "application/json" }, cf: { cacheTtl: 0 } });
    if (metadataResponse.status === 404) return notFound();
    if (!metadataResponse.ok) throw new Error(`metadata response ${metadataResponse.status}`);
    const payload = await metadataResponse.json();
    if (!payload?.metadata?.title || !payload.metadata.canonicalPath) throw new Error("metadata payload invalid");
    const indexRequest = new Request(new URL("/index.html", request.url), { method: "GET", headers: request.headers });
    const indexResponse = await env.ASSETS.fetch(indexRequest);
    if (!indexResponse.ok) throw new Error("index asset unavailable");
    const body = injectMetadata(await indexResponse.text(), payload.metadata, request.url);
    const headers = new Headers(indexResponse.headers);
    headers.set("Content-Type", "text/html; charset=UTF-8");
    headers.set("Cache-Control", "no-store");
    headers.set("ETag", `W/\"${payload.metadata.cacheKey}\"`);
    headers.set("X-Retro-Published-Version", String(payload.metadata.publishedVersion));
    headers.delete("Content-Length");
    return new Response(request.method === "HEAD" ? null : body, { status: 200, headers });
  } catch {
    const fallback = await env.ASSETS.fetch(new Request(new URL("/index.html", request.url), request));
    const headers = new Headers(fallback.headers);
    headers.set("Cache-Control", "no-store");
    headers.set("X-Retro-Metadata", "unavailable");
    return new Response(request.method === "HEAD" ? null : await fallback.text(), { status: fallback.status, headers });
  }
}

export default { fetch(request, env) { return handleRequest(request, env); } };
