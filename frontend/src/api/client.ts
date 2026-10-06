import type { EditParams } from "../gl/params";

export interface Photo {
  id: number; filename: string; mime_type: string; size_bytes: number;
  width: number; height: number; captured_at: string | null;
  exif: Record<string, string | number | number[]>;
  rating: number; flag: number; color_label: string | null; created_at: string; has_edits: boolean;
  folder: string; title: string | null; caption: string | null; keywords: string[];
}
export interface Counted { id: number | null; name: string; count: number }
export interface PhotoComment { id: number; text: string; created_at: string }
export interface Preset { id: number; name: string; params: EditParams }
export interface ExportOpts { format: "jpeg" | "png"; quality: number; max_size?: number }
export interface User { id: number; email: string }
export interface HistoryEntry { id: number; label: string; params: EditParams; created_at: string }
export interface ListFilter {
  rating_min?: number; flag?: -1 | 0 | 1; color_label?: string; q?: string;
  collection_id?: number; keyword_id?: number; folder?: string;
  sort?: "captured_at" | "created_at" | "rating" | "filename"; order?: "asc" | "desc";
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const BASE: string = import.meta.env.VITE_API_URL ?? "/api";

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const r = await fetch(`${BASE}${path}`, { ...init, headers, credentials: "include" });
  if (!r.ok) {
    let detail = r.statusText;
    try {
      const j = await r.json();
      detail = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
    } catch { /* not json */ }
    throw new ApiError(r.status, detail);
  }
  if (r.status === 204) return undefined as T;
  const ct = r.headers.get("content-type") ?? "";
  return (ct.includes("json") ? r.json() : r.blob()) as Promise<T>;
}

const json = (body: unknown) => JSON.stringify(body);

export const api = {
  me: () => req<User>("/auth/me"),
  login: (email: string, password: string) => req<User>("/auth/login", { method: "POST", body: json({ email, password }) }),
  register: (email: string, password: string) => req<User>("/auth/register", { method: "POST", body: json({ email, password }) }),
  logout: () => req<void>("/auth/logout", { method: "POST" }),

  listPhotos: (f: ListFilter = {}) => {
    const q = new URLSearchParams();
    Object.entries(f).forEach(([k, v]) => v !== undefined && q.set(k, String(v)));
    return req<Photo[]>(`/photos?${q}`);
  },
  upload: (files: File[], folder?: string) => {
    const fd = new FormData();
    if (folder) fd.append("folder", folder);
    files.forEach((f) => fd.append("files", f));
    return req<Photo[]>("/photos", { method: "POST", body: fd });
  },
  patchPhoto: (id: number, patch: Partial<Pick<Photo, "rating" | "flag" | "title" | "caption">> & { color_label?: string }) =>
    req<Photo>(`/photos/${id}`, { method: "PATCH", body: json(patch) }),
  deletePhoto: (id: number) => req<void>(`/photos/${id}`, { method: "DELETE" }),

  getEdit: (id: number) => req<{ params: EditParams }>(`/photos/${id}/edit`),
  putEdit: (id: number, params: EditParams) => req<{ params: EditParams }>(`/photos/${id}/edit`, { method: "PUT", body: json(params) }),
  listHistory: (id: number) => req<HistoryEntry[]>(`/photos/${id}/history`),
  addSnapshot: (id: number, label: string) => req<HistoryEntry>(`/photos/${id}/history`, { method: "POST", body: json({ label }) }),
  exportPhoto: (id: number, opts: ExportOpts) => req<Blob>(`/photos/${id}/export`, { method: "POST", body: json(opts) }),

  folders: () => req<Counted[]>("/folders"),
  collections: () => req<Counted[]>("/collections"),
  createCollection: (name: string) => req<Counted>("/collections", { method: "POST", body: json({ name }) }),
  renameCollection: (id: number, name: string) => req<Counted>(`/collections/${id}`, { method: "PATCH", body: json({ name }) }),
  deleteCollection: (id: number) => req<void>(`/collections/${id}`, { method: "DELETE" }),
  addToCollection: (id: number, photo_ids: number[]) => req<void>(`/collections/${id}/photos`, { method: "POST", body: json({ photo_ids }) }),
  removeFromCollection: (id: number, photo_ids: number[]) => req<void>(`/collections/${id}/photos/remove`, { method: "POST", body: json({ photo_ids }) }),
  publishCollection: (id: number, opts: ExportOpts) => req<Blob>(`/collections/${id}/export`, { method: "POST", body: json(opts) }),

  keywords: () => req<Counted[]>("/keywords"),
  applyKeywords: (photo_ids: number[], add: string[], remove: string[] = []) =>
    req<void>("/keywords/apply", { method: "POST", body: json({ photo_ids, add, remove }) }),
  deleteKeyword: (id: number) => req<void>(`/keywords/${id}`, { method: "DELETE" }),

  comments: (id: number) => req<PhotoComment[]>(`/photos/${id}/comments`),
  addComment: (id: number, text: string) => req<PhotoComment>(`/photos/${id}/comments`, { method: "POST", body: json({ text }) }),
  deleteComment: (id: number) => req<void>(`/comments/${id}`, { method: "DELETE" }),

  presets: () => req<Preset[]>("/presets"),
  savePreset: (name: string, params: EditParams) => req<Preset>(`/presets/${encodeURIComponent(name)}`, { method: "PUT", body: json(params) }),
  deletePreset: (id: number) => req<void>(`/presets/${id}`, { method: "DELETE" }),
};

export const fileUrl = (id: number, kind: "thumb" | "preview" | "original") => `${BASE}/photos/${id}/file/${kind}`;
