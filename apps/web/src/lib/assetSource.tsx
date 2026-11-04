import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { parseAssetReference } from "@retrodesk/shared";
import { supabase } from "./supabase";

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:8787").replace(/\/$/, "");
export type AsyncAssetResolver = (source: string) => Promise<string | null>;
export type AssetSourceState = {
  source: string | null;
  status: "empty" | "loading" | "ready" | "failed";
};
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
  const [current, setCurrent] = useState<{ siteId: string; resolve: AsyncAssetResolver } | null>(null);
  useEffect(() => {
    // The effect owns the disposable resolver. StrictMode replays effect setup
    // after cleanup, so each setup needs a fresh instance with its own cache.
    const resolver = createAssetResolver({ fetchBlob: async (id) => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return null;
      const response = await fetch(`${API_URL}/api/sites/${encodeURIComponent(siteId)}/assets/${id}/content`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) return null;
      return response.blob();
    } });
    setCurrent({ siteId, resolve: resolver.resolve });
    return () => resolver.dispose();
  }, [siteId]);
  // A site change must stop exposing the old resolver before effects run.
  const resolve = current?.siteId === siteId ? current.resolve : null;
  return <AssetSourceContext.Provider value={resolve}>{children}</AssetSourceContext.Provider>;
}

export function useAssetSourceState(source: string | null | undefined): AssetSourceState {
  const resolve = useContext(AssetSourceContext);
  const isProtectedReference = !!source && !!parseAssetReference(source);
  const [state, setState] = useState<{
    input: string | null | undefined;
    resolve: AsyncAssetResolver | null;
    result: AssetSourceState;
  }>(() => ({
    input: source,
    resolve,
    result: { source: null, status: "loading" },
  }));
  useEffect(() => {
    let active = true;
    if (!source || !isProtectedReference) {
      setState({ input: source, resolve, result: { source: source || null, status: source ? "ready" : "empty" } });
      return () => { active = false; };
    }
    setState({ input: source, resolve, result: { source: null, status: "loading" } });
    if (!resolve) return () => { active = false; };
    resolve(source).then((next) => {
      if (active) setState({ input: source, resolve, result: { source: next, status: next ? "ready" : "failed" } });
    }, () => {
      if (active) setState({ input: source, resolve, result: { source: null, status: "failed" } });
    });
    return () => { active = false; };
  }, [isProtectedReference, resolve, source]);
  if (!source) return { source: null, status: "empty" };
  if (!isProtectedReference) return { source, status: "ready" };
  // Effects run after paint. Guard both input and resolver identity so even the
  // same protected reference cannot flash a previous site's URL or failure.
  return state.input === source && state.resolve === resolve
    ? state.result
    : { source: null, status: "loading" };
}

export function useAssetSource(source: string | null | undefined): string | null {
  return useAssetSourceState(source).source;
}
