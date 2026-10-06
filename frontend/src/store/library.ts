import { create } from "zustand";
import { type ListFilter, type Photo, api } from "../api/client";
import { type EditParams, isDefault, withDefaults } from "../gl/params";

export type Module = "library" | "develop";
export type ViewMode = "grid" | "loupe";

interface LibraryState {
  photos: Photo[];
  loading: boolean;
  filter: ListFilter;
  selected: Set<number>;
  active: number | null; // most-recently selected / current photo
  module: Module;
  view: ViewMode;
  thumbSize: number;
  uploading: { done: number; total: number } | null;
  error: string | null;

  load: () => Promise<void>;
  setFilter: (f: Partial<ListFilter>) => Promise<void>;
  select: (id: number, mode?: "single" | "toggle" | "range") => void;
  selectAll: () => void;
  move: (delta: number, extend?: boolean) => void;
  setModule: (m: Module) => void;
  setView: (v: ViewMode) => void;
  setThumbSize: (n: number) => void;
  upload: (files: File[], folder?: string) => Promise<void>;
  /** bumps whenever collections / keywords / folders may have changed, so sidebars refetch */
  sidebarVersion: number;
  bumpSidebars: () => void;
  updatePhoto: (id: number, patch: Partial<Photo>) => void;
  patch: (ids: number[], patch: { rating?: number; flag?: number; color_label?: string }) => Promise<void>;
  remove: (ids: number[]) => Promise<void>;
  markEdited: (id: number, edited: boolean) => void;
  /** Quick Develop: read-modify-write edit params of several photos. */
  quickAdjust: (ids: number[], fn: (p: EditParams) => EditParams) => Promise<void>;
  setError: (e: string | null) => void;
}

export const useLibrary = create<LibraryState>((set, get) => ({
  photos: [], loading: false, filter: { sort: "captured_at", order: "desc" },
  selected: new Set(), active: null, module: "library", view: "grid", thumbSize: 200,
  uploading: null, error: null, sidebarVersion: 0,

  async load() {
    set({ loading: true });
    try {
      const photos = await api.listPhotos(get().filter);
      const { active, selected } = get();
      const ids = new Set(photos.map((p) => p.id));
      const keep = new Set([...selected].filter((i) => ids.has(i)));
      const act = active !== null && ids.has(active) ? active : (photos[0]?.id ?? null);
      if (act !== null && keep.size === 0) keep.add(act);
      set({ photos, selected: keep, active: act, loading: false });
    } catch (e) {
      set({ loading: false, error: (e as Error).message });
    }
  },

  async setFilter(f) {
    set({ filter: { ...get().filter, ...f } });
    await get().load();
  },

  select(id, mode = "single") {
    const { photos, selected, active } = get();
    if (mode === "toggle") {
      const next = new Set(selected);
      if (next.has(id) && next.size > 1) next.delete(id); else next.add(id);
      set({ selected: next, active: id });
    } else if (mode === "range" && active !== null) {
      const a = photos.findIndex((p) => p.id === active);
      const b = photos.findIndex((p) => p.id === id);
      const [lo, hi] = a < b ? [a, b] : [b, a];
      set({ selected: new Set(photos.slice(lo, hi + 1).map((p) => p.id)) });
    } else {
      set({ selected: new Set([id]), active: id });
    }
  },

  selectAll: () => set({ selected: new Set(get().photos.map((p) => p.id)) }),

  move(delta, extend = false) {
    const { photos, active } = get();
    if (!photos.length) return;
    const i = photos.findIndex((p) => p.id === active);
    const next = photos[Math.min(photos.length - 1, Math.max(0, (i < 0 ? 0 : i) + delta))];
    get().select(next.id, extend ? "range" : "single");
    if (extend) set({ active: next.id });
  },

  setModule: (module) => set({ module }),
  setView: (view) => set({ view }),
  setThumbSize: (thumbSize) => set({ thumbSize }),
  setError: (error) => set({ error }),

  bumpSidebars: () => set({ sidebarVersion: get().sidebarVersion + 1 }),
  updatePhoto: (id, patch) => set({ photos: get().photos.map((p) => (p.id === id ? { ...p, ...patch } : p)) }),

  async upload(files, folder) {
    const total = files.length;
    set({ uploading: { done: 0, total } });
    try {
      for (let i = 0; i < files.length; i += 4) {
        await api.upload(files.slice(i, i + 4), folder);
        set({ uploading: { done: Math.min(total, i + 4), total } });
      }
      await get().load();
      get().bumpSidebars();
    } catch (e) {
      set({ error: (e as Error).message });
    } finally {
      set({ uploading: null });
    }
  },

  async patch(ids, patch) {
    // optimistic update
    const apply = (p: Photo): Photo =>
      !ids.includes(p.id) ? p : {
        ...p,
        ...(patch.rating !== undefined && { rating: patch.rating }),
        ...(patch.flag !== undefined && { flag: patch.flag }),
        ...(patch.color_label !== undefined && { color_label: patch.color_label === "none" ? null : patch.color_label }),
      };
    set({ photos: get().photos.map(apply) });
    try {
      await Promise.all(ids.map((id) => api.patchPhoto(id, patch)));
    } catch (e) {
      set({ error: (e as Error).message });
      await get().load();
    }
  },

  async remove(ids) {
    try {
      await Promise.all(ids.map((id) => api.deletePhoto(id)));
      set({ selected: new Set(), active: null });
      await get().load();
      get().bumpSidebars();
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  async quickAdjust(ids, fn) {
    try {
      await Promise.all(ids.map(async (id) => {
        const { params } = await api.getEdit(id);
        const next = fn(withDefaults(params));
        await api.putEdit(id, next);
        get().markEdited(id, !isDefault(next));
      }));
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  markEdited: (id, edited) => set({ photos: get().photos.map((p) => (p.id === id ? { ...p, has_edits: edited } : p)) }),
}));
