import { create } from "zustand";
import { api } from "../api/client";
import { type EditParams, type NumericKey, defaultParams, isDefault, withDefaults } from "../gl/params";
import { useLibrary } from "./library";

interface Entry { label: string; params: EditParams }

interface DevelopState {
  photoId: number | null;
  params: EditParams;
  history: Entry[];
  index: number;
  clipboard: EditParams | null;
  previous: EditParams | null; // settings of the previously opened photo ("Previous" button)
  saveState: "idle" | "saving" | "saved" | "error";
  before: boolean;

  open: (id: number) => Promise<void>;
  setNum: (key: NumericKey, value: number) => void;
  setParams: (p: EditParams) => void; // live change, no history
  commit: (label: string) => void;
  undo: () => void;
  redo: () => void;
  jump: (i: number) => void;
  reset: () => void;
  apply: (p: EditParams, label: string) => void;
  copy: () => void;
  paste: () => void;
  applyPrevious: () => void;
  setBefore: (b: boolean) => void;
  flushNow: () => Promise<void>;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;

export const useDevelop = create<DevelopState>((set, get) => {
  const scheduleSave = () => {
    clearTimeout(saveTimer);
    set({ saveState: "saving" });
    saveTimer = setTimeout(() => void flush(), 500);
  };
  const flush = async () => {
    clearTimeout(saveTimer);
    const { photoId, params } = get();
    if (photoId === null) return;
    try {
      await api.putEdit(photoId, params);
      useLibrary.getState().markEdited(photoId, !isDefault(params));
      if (get().photoId === photoId) set({ saveState: "saved" });
    } catch {
      set({ saveState: "error" });
    }
  };

  return {
    photoId: null, params: defaultParams(), history: [], index: 0, clipboard: null, previous: null, saveState: "idle", before: false,

    async open(id) {
      const prev = get().photoId;
      if (prev !== null && prev !== id) await flush();
      const { params } = await api.getEdit(id);
      const p = withDefaults(params);
      set({ previous: prev !== null && prev !== id ? get().params : get().previous, photoId: id, params: p, history: [{ label: "Open", params: p }], index: 0, saveState: "idle", before: false });
    },

    setNum: (key, value) => { set({ params: { ...get().params, [key]: value } }); scheduleSave(); },
    setParams: (params) => { set({ params }); scheduleSave(); },

    commit(label) {
      const { history, index, params } = get();
      const last = history[index];
      if (JSON.stringify(last.params) === JSON.stringify(params)) return;
      const next = [...history.slice(0, index + 1), { label, params }].slice(-100);
      set({ history: next, index: next.length - 1 });
    },

    undo() { get().jump(get().index - 1); },
    redo() { get().jump(get().index + 1); },
    jump(i) {
      const { history } = get();
      if (i < 0 || i >= history.length) return;
      set({ index: i, params: history[i].params });
      scheduleSave();
    },

    reset() { get().apply(defaultParams(), "Reset"); },
    apply(p, label) { set({ params: p }); get().commit(label); scheduleSave(); },
    copy() { set({ clipboard: structuredClone(get().params) }); },
    paste() { const c = get().clipboard; if (c) get().apply(structuredClone(c), "Paste settings"); },
    applyPrevious() { const p = get().previous; if (p) get().apply(structuredClone(p), "Previous settings"); },
    setBefore: (before) => set({ before }),
    flushNow: flush,
  };
});
