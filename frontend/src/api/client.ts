import type { EditParams } from "../gl/params";

export interface Photo {
  id: number; filename: string; mime_type: string; size_bytes: number;
  width: number; height: number; captured_at: string | null;
  exif: Record<string, string | number | number[]>;
  rating: number; flag: number; color_label: string | null; created_at: string; has_edits: boolean;
}
export interface User { id: number; email: string }
export interface HistoryEntry { id: number; label: string; params: EditParams; created_at: string }
export interface ListFilter {
  rating_min?: number; flag?: -1 | 0 | 1; color_label?: string;
  sort?: "captured_at" | "created_at" | "rating" | "filename"; order?: "asc" | "desc";
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const r = await fetch(`/api${path}`, { ...init, headers, credentials: "include" });
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
  upload: (files: File[]) => {
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f));
    return req<Photo[]>("/photos", { method: "POST", body: fd });
  },
  patchPhoto: (id: number, patch: Partial<Pick<Photo, "rating" | "flag">> & { color_label?: string }) =>
    req<Photo>(`/photos/${id}`, { method: "PATCH", body: json(patch) }),
  deletePhoto: (id: number) => req<void>(`/photos/${id}`, { method: "DELETE" }),

  getEdit: (id: number) => req<{ params: EditParams }>(`/photos/${id}/edit`),
  putEdit: (id: number, params: EditParams) => req<{ params: EditParams }>(`/photos/${id}/edit`, { method: "PUT", body: json(params) }),
  listHistory: (id: number) => req<HistoryEntry[]>(`/photos/${id}/history`),
  addSnapshot: (id: number, label: string) => req<HistoryEntry>(`/photos/${id}/history`, { method: "POST", body: json({ label }) }),
  exportPhoto: (id: number, opts: { format: "jpeg" | "png"; quality: number; max_size?: number }) =>
    req<Blob>(`/photos/${id}/export`, { method: "POST", body: json(opts) }),
};

export const fileUrl = (id: number, kind: "thumb" | "preview" | "original") => `/api/photos/${id}/file/${kind}`;
