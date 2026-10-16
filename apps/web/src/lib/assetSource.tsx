import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { parseAssetReference } from "@retrodesk/shared";
import { supabase } from "./supabase";

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:8787").replace(/\/$/, "");
export type AsyncAssetResolver = (source: string) => Promise<string | null>;
const AssetSourceContext = createContext<AsyncAssetResolver | null>(null);

export function initialAssetSourceValue(source: string | null | undefined): string | null {
  return source && parseAssetReference(source) ? null : source ?? null;
}

export function createAssetResolver(input: { fetchBlob: (id: string) => Promise<Blob | null>; createUrl?: (blob: Blob) => string; revokeUrl?: (url: string) => void }) {
  const cache = new Map<string, string>();
  const pending = new Map<string, Promise<string | null>>();
  const urls = new Set<string>();
  let disposed = false;
  const createUrl = input.createUrl ?? ((blob: Blob) => URL.createObjectURL(blob));
  const revokeUrl = input.revokeUrl ?? ((url: string) => URL.revokeObjectURL(url));
  const resolve: AsyncAssetResolver = async (source) => {
    const id = parseAssetReference(source);
    if (!id || disposed) return id ? null : source;
    const cached = cache.get(id);
    if (cached) return cached;
    const active = pending.get(id);
    if (active) return active;
    const request = input.fetchBlob(id).then((blob) => {
      if (!blob || disposed) return null;
      const url = createUrl(blob);
      cache.set(id, url); urls.add(url); return url;
    }).catch(() => null).finally(() => pending.delete(id));
    pending.set(id, request); return request;
  };
  return { resolve, dispose: () => { disposed = true; for (const url of urls) revokeUrl(url); urls.clear(); cache.clear(); pending.clear(); } };
}

export function useAssetResolver(): AsyncAssetResolver | null {
  return useContext(AssetSourceContext);
}

export function AssetSourceProvider({ siteId, children }: { siteId: string; children: ReactNode }) {
  const resolver = useMemo(() => createAssetResolver({ fetchBlob: async (id) => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return null;
      const response = await fetch(`${API_URL}/api/sites/${encodeURIComponent(siteId)}/assets/${id}/content`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) return null;
      return response.blob();
    } }), [siteId]);
  useEffect(() => {
    return () => resolver.dispose();
  }, [resolver]);
  return <AssetSourceContext.Provider value={resolver.resolve}>{children}</AssetSourceContext.Provider>;
}

export function useAssetSource(source: string | null | undefined): string | null {
  const resolve = useContext(AssetSourceContext);
  const [state, setState] = useState<{ source: string | null | undefined; value: string | null }>(() => ({
    source,
    // Protected references must never be exposed as an image URL while they
    // are being exchanged for a short-lived blob URL.
    value: initialAssetSourceValue(source),
  }));
  const isProtectedReference = !!source && !!parseAssetReference(source);
  useEffect(() => {
    let active = true;
    if (!source || !isProtectedReference) {
      setState({ source, value: source ?? null });
      return () => { active = false; };
    }
    setState({ source, value: null });
    if (!resolve) return () => { active = false; };
    resolve(source).then((next) => { if (active) setState({ source, value: next }); });
    return () => { active = false; };
  }, [isProtectedReference, resolve, source]);
  // Effects run after paint. Derive a reset value for a changed source so a
  // previous URL (or failure state) cannot flash while the new reference loads.
  return state.source === source ? state.value : (isProtectedReference ? null : source ?? null);
}
