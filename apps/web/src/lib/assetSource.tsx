import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { parseAssetReference } from "@retrodesk/shared";
import { supabase } from "./supabase";

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:8787").replace(/\/$/, "");
type AsyncResolver = (source: string) => Promise<string | null>;
const AssetSourceContext = createContext<AsyncResolver | null>(null);

export function AssetSourceProvider({ siteId, children }: { siteId: string; children: ReactNode }) {
  const cache = useRef(new Map<string, string>());
  const pending = useRef(new Map<string, Promise<string | null>>());
  const objectUrls = useRef(new Set<string>());
  const resolve = useCallback<AsyncResolver>(async (source) => {
    const id = parseAssetReference(source);
    if (!id) return source;
    const cached = cache.current.get(id);
    if (cached) return cached;
    const active = pending.current.get(id);
    if (active) return active;
    const request = (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return null;
      const response = await fetch(`${API_URL}/api/sites/${encodeURIComponent(siteId)}/assets/${id}/content`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) return null;
      const url = URL.createObjectURL(await response.blob());
      cache.current.set(id, url);
      objectUrls.current.add(url);
      return url;
    })().catch(() => null).finally(() => pending.current.delete(id));
    pending.current.set(id, request);
    return request;
  }, [siteId]);
  useEffect(() => () => { for (const url of objectUrls.current) URL.revokeObjectURL(url); }, []);
  return <AssetSourceContext.Provider value={resolve}>{children}</AssetSourceContext.Provider>;
}

export function useAssetSource(source: string | null | undefined): string | null {
  const resolve = useContext(AssetSourceContext);
  const [value, setValue] = useState<string | null>(() => source ?? null);
  useEffect(() => {
    let active = true;
    if (!source || !parseAssetReference(source) || !resolve) { setValue(source ?? null); return () => { active = false; }; }
    setValue(null);
    resolve(source).then((next) => { if (active) setValue(next); });
    return () => { active = false; };
  }, [resolve, source]);
  return value;
}
