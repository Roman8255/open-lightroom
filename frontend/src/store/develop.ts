import { create } from "zustand";
import { api } from "../api/client";
import {
  type EditParams, type Mask, type MaskAdj, type NumericKey, type RedEye, type Spot, MAX_EYES, MAX_MASKS, MAX_SPOTS,
  defaultParams, isDefault, withDefaults,
} from "../gl/params";
import { useLibrary } from "./library";

interface Entry { label: string; params: EditParams }

export type Tool = null | "crop" | "spot" | "redeye" | "linear" | "radial" | "brush";
export const MASK_TOOLS: Tool[] = ["linear", "radial", "brush"];
export interface BrushSettings { size: number; feather: number; erase: boolean }
export type CropAspect = "free" | "original" | "1:1" | "4:5" | "3:2" | "16:9";
export const CROP_ASPECTS: CropAspect[] = ["free", "original", "1:1", "4:5", "3:2", "16:9"];

/** Locked pixel ratio (w/h) of the crop, or null when free. */
export function lockedRatio(a: CropAspect, flip: boolean, imgAspect: number): number | null {
  if (a === "free") return null;
  const r = a === "original" ? imgAspect : a === "1:1" ? 1 : a === "4:5" ? 4 / 5 : a === "3:2" ? 3 / 2 : 16 / 9;
  return flip && a !== "1:1" ? 1 / r : r;
}

interface DevelopState {
  photoId: number | null;
  params: EditParams;
  history: Entry[];
  index: number;
  clipboard: EditParams | null;
  previous: EditParams | null; // settings of the previously opened photo ("Previous" button)
  saveState: "idle" | "saving" | "saved" | "error";
  before: boolean;
  // tools
  tool: Tool;
  selMask: number | null;
  selSpot: number | null;
  selEye: number | null;
  showMaskOverlay: boolean;
  brush: BrushSettings;
  cropAspect: CropAspect;
  cropFlip: boolean;

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

  setTool: (t: Tool) => void;
  setBrush: (b: Partial<BrushSettings>) => void;
  setShowMaskOverlay: (v: boolean) => void;
  setCropAspect: (a: CropAspect) => void;
  flipCropAspect: () => void;
  // masks
  addMask: (m: Mask) => boolean;
  updateMask: (i: number, patch: Partial<Mask>) => void;
  updateMaskAdj: (i: number, key: keyof MaskAdj, value: number) => void;
  removeMask: (i: number) => void;
  toggleMask: (i: number) => void;
  invertMask: (i: number) => void;
  selectMask: (i: number | null) => void;
  cycleMask: (delta: number) => void;
  // spots / red eye
  addSpot: (s: Spot) => void;
  updateSpot: (i: number, patch: Partial<Spot>) => void;
  removeSpot: (i: number) => void;
  selectSpot: (i: number | null) => void;
  addEye: (e: RedEye) => void;
  updateEye: (i: number, patch: Partial<RedEye>) => void;
  removeEye: (i: number) => void;
  selectEye: (i: number | null) => void;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;

/** What presets / paste / previous must never overwrite: framing and local corrections. */
const keepGeometryAndLocal = (base: EditParams, next: EditParams): EditParams => ({
  ...next, crop: base.crop, spots: base.spots, red_eyes: base.red_eyes, masks: base.masks,
  distortion: base.distortion, vertical: base.vertical, horizontal: base.horizontal, rotate: base.rotate,
  scale: base.scale, aspect: base.aspect,
});

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
  const live = (params: EditParams) => { set({ params }); scheduleSave(); };
  const setMasks = (fn: (m: Mask[]) => Mask[]) => live({ ...get().params, masks: fn(get().params.masks) });

  return {
    photoId: null, params: defaultParams(), history: [], index: 0, clipboard: null, previous: null, saveState: "idle", before: false,
    tool: null, selMask: null, selSpot: null, selEye: null, showMaskOverlay: true, brush: { size: 0.05, feather: 0.5, erase: false },
    cropAspect: "free", cropFlip: false,

    async open(id) {
      const prev = get().photoId;
      if (prev !== null && prev !== id) await flush();
      const { params } = await api.getEdit(id);
      const p = withDefaults(params);
      set({
        previous: prev !== null && prev !== id ? get().params : get().previous, photoId: id, params: p,
        history: [{ label: "Open", params: p }], index: 0, saveState: "idle", before: false,
        tool: null, selMask: null, selSpot: null, selEye: null,
      });
    },

    setNum: (key, value) => live({ ...get().params, [key]: value }),
    setParams: live,

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
      set({ index: i, params: history[i].params, selMask: null, selSpot: null, selEye: null });
      scheduleSave();
    },

    reset() { get().apply(defaultParams(), "Reset"); set({ selMask: null, selSpot: null, selEye: null }); },
    apply(p, label) { set({ params: p }); get().commit(label); scheduleSave(); },
    copy() { set({ clipboard: structuredClone(get().params) }); },
    paste() { const c = get().clipboard; if (c) get().apply(keepGeometryAndLocal(get().params, structuredClone(c)), "Paste settings"); },
    applyPrevious() { const p = get().previous; if (p) get().apply(keepGeometryAndLocal(get().params, structuredClone(p)), "Previous settings"); },
    setBefore: (before) => set({ before }),
    flushNow: flush,

    setTool(tool) {
      const { params } = get();
      let selMask: number | null = null;
      if (tool && MASK_TOOLS.includes(tool)) {
        const last = params.masks.map((m, i) => ({ m, i })).filter(({ m }) => m.type === tool).pop();
        selMask = last ? last.i : null;
      }
      set({ tool, selMask, selSpot: null, selEye: null });
    },
    setBrush: (b) => set({ brush: { ...get().brush, ...b } }),
    setShowMaskOverlay: (showMaskOverlay) => set({ showMaskOverlay }),
    setCropAspect: (cropAspect) => set({ cropAspect }),
    flipCropAspect: () => set({ cropFlip: !get().cropFlip }),

    // ── masks ──
    addMask(m) {
      if (get().params.masks.length >= MAX_MASKS) {
        useLibrary.getState().setError(`At most ${MAX_MASKS} masks per photo`);
        return false;
      }
      setMasks((ms) => [...ms, m]);
      set({ selMask: get().params.masks.length - 1 });
      get().commit(`Add ${m.type} mask`);
      return true;
    },
    updateMask: (i, patch) => setMasks((ms) => ms.map((m, k) => (k === i ? { ...m, ...patch } : m))),
    updateMaskAdj: (i, key, value) => setMasks((ms) => ms.map((m, k) => (k === i ? { ...m, adj: { ...m.adj, [key]: value } } : m))),
    removeMask(i) {
      setMasks((ms) => ms.filter((_, k) => k !== i));
      const n = get().params.masks.length;
      set({ selMask: n === 0 ? null : Math.min(i, n - 1) });
      get().commit("Delete mask");
    },
    toggleMask(i) {
      const m = get().params.masks[i];
      if (!m) return;
      get().updateMask(i, { enabled: !m.enabled });
      get().commit(m.enabled ? "Hide mask" : "Show mask");
    },
    invertMask(i) {
      const m = get().params.masks[i];
      if (!m) return;
      get().updateMask(i, { invert: !m.invert });
      get().commit("Invert mask");
    },
    selectMask(i) {
      const m = i === null ? null : get().params.masks[i];
      set({ selMask: m ? i : null, selSpot: null, selEye: null, ...(m && get().tool && MASK_TOOLS.includes(get().tool) ? { tool: m.type } : {}) });
    },
    cycleMask(delta) {
      const n = get().params.masks.length;
      if (!n) return;
      const cur = get().selMask ?? (delta > 0 ? -1 : 0);
      get().selectMask((cur + delta + n) % n);
    },

    // ── spots / red eye ──
    addSpot(s) {
      if (get().params.spots.length >= MAX_SPOTS) { useLibrary.getState().setError(`At most ${MAX_SPOTS} spots`); return; }
      live({ ...get().params, spots: [...get().params.spots, s] });
      set({ selSpot: get().params.spots.length - 1 });
      get().commit("Add spot");
    },
    updateSpot: (i, patch) => live({ ...get().params, spots: get().params.spots.map((s, k) => (k === i ? { ...s, ...patch } : s)) }),
    removeSpot(i) {
      live({ ...get().params, spots: get().params.spots.filter((_, k) => k !== i) });
      set({ selSpot: null });
      get().commit("Delete spot");
    },
    selectSpot: (selSpot) => set({ selSpot }),
    addEye(e) {
      if (get().params.red_eyes.length >= MAX_EYES) { useLibrary.getState().setError(`At most ${MAX_EYES} red-eye fixes`); return; }
      live({ ...get().params, red_eyes: [...get().params.red_eyes, e] });
      set({ selEye: get().params.red_eyes.length - 1 });
      get().commit("Red eye");
    },
    updateEye: (i, patch) => live({ ...get().params, red_eyes: get().params.red_eyes.map((s, k) => (k === i ? { ...s, ...patch } : s)) }),
    removeEye(i) {
      live({ ...get().params, red_eyes: get().params.red_eyes.filter((_, k) => k !== i) });
      set({ selEye: null });
      get().commit("Delete red-eye fix");
    },
    selectEye: (selEye) => set({ selEye }),
  };
});
