import { curveLut } from "./curve";
import { maskTextureData } from "./masks";
import {
  type EditParams, HSL_BANDS, calMatrix, defaultParams, isCalDefault, isGradeActive, isIdentityCurve, isIdentityGeometry,
  zoneTint,
} from "./params";
import { FRAG_FINAL, FRAG_GEO, FRAG_MASK, FRAG_TONE, VERT } from "./shader";

/** normal = final result · crop = whole frame (transform applied, crop ignored) · local = untransformed source frame */
export type View = "normal" | "crop" | "local";

class Prog {
  private locs = new Map<string, WebGLUniformLocation | null>();
  constructor(public gl: WebGL2RenderingContext, public p: WebGLProgram) {}
  loc(n: string) {
    if (!this.locs.has(n)) this.locs.set(n, this.gl.getUniformLocation(this.p, n));
    return this.locs.get(n)!;
  }
  f(n: string, v: number) { this.gl.uniform1f(this.loc(n), v); }
  i(n: string, v: number | boolean) { this.gl.uniform1i(this.loc(n), Number(v)); }
  v2(n: string, a: number, b: number) { this.gl.uniform2f(this.loc(n), a, b); }
  v4(n: string, a: number, b: number, c: number, d: number) { this.gl.uniform4f(this.loc(n), a, b, c, d); }
  fv3(n: string, v: Float32Array) { this.gl.uniform3fv(this.loc(n), v); }
  fv4(n: string, v: Float32Array) { this.gl.uniform4fv(this.loc(n), v); }
  m3(n: string, v: Float32Array) { this.gl.uniformMatrix3fv(this.loc(n), false, v); }
}

interface Target { tex: WebGLTexture; fbo: WebGLFramebuffer }

export class GLRenderer {
  private gl: WebGL2RenderingContext;
  private geo: Prog; private maskP: Prog; private tone: Prog; private final: Prog;
  private srcTex: WebGLTexture; private maskSrcTex: WebGLTexture; private curveTex: WebGLTexture;
  private G: Target | null = null; private M: Target | null = null; private T: Target | null = null;
  private float16: boolean;
  private maskKey = ""; private curveKey = "";
  width = 0; height = 0; // source image size
  outW = 1; outH = 1; // render target size

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true, antialias: false });
    if (!gl) throw new Error("WebGL2 is not supported in this browser");
    this.gl = gl;
    this.float16 = !!gl.getExtension("EXT_color_buffer_float");
    this.geo = this.link(FRAG_GEO); this.maskP = this.link(FRAG_MASK); this.tone = this.link(FRAG_TONE); this.final = this.link(FRAG_FINAL);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    for (const pr of [this.geo, this.maskP, this.tone, this.final]) {
      gl.useProgram(pr.p);
      const a = gl.getAttribLocation(pr.p, "a_pos");
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    }
    this.srcTex = this.makeTex(gl.LINEAR);
    this.maskSrcTex = this.makeTex(gl.LINEAR);
    this.curveTex = this.makeTex(gl.LINEAR);
  }

  private link(frag: string): Prog {
    const gl = this.gl;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader error");
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link error");
    return new Prog(gl, p);
  }

  private makeTex(filter: number): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  private makeTarget(w: number, h: number): Target {
    const gl = this.gl;
    const tex = this.makeTex(gl.LINEAR);
    if (this.float16) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fbo };
  }

  private freeTarget(t: Target | null) {
    if (!t) return;
    this.gl.deleteTexture(t.tex);
    this.gl.deleteFramebuffer(t.fbo);
  }

  setImage(img: HTMLImageElement) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    this.width = img.naturalWidth;
    this.height = img.naturalHeight;
    this.maskKey = "";
  }

  /** Aspect ratio (w/h) of the framed output for a given view. */
  frameAspect(p: EditParams, view: View): number {
    if (view !== "normal") return this.width / this.height;
    return (this.width * p.crop.w) / (this.height * p.crop.h);
  }

  /** Resize the drawing buffer (device pixels); intermediate targets follow. */
  resize(w: number, h: number) {
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    if (w === this.outW && h === this.outH && this.G) return;
    this.outW = w; this.outH = h;
    this.canvas.width = w; this.canvas.height = h;
    this.freeTarget(this.G); this.freeTarget(this.M); this.freeTarget(this.T);
    this.G = this.makeTarget(w, h); this.M = this.makeTarget(w, h); this.T = this.makeTarget(w, h);
  }

  private bindTex(unit: number, tex: WebGLTexture) {
    this.gl.activeTexture(this.gl.TEXTURE0 + unit);
    this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
  }

  private setGeometry(pr: Prog, p: EditParams, view: View) {
    const c = view === "normal" ? p.crop : { x: 0, y: 0, w: 1, h: 1, angle: view === "crop" ? p.crop.angle : 0 };
    const q = view === "local" ? { ...p, distortion: 0, vertical: 0, horizontal: 0, rotate: 0, scale: 100, aspect: 0, crop: c } : { ...p, crop: c };
    pr.v4("u_crop", c.x, c.y, c.w, c.h);
    pr.f("u_aspect", this.width / this.height);
    pr.f("u_scale", q.scale / 100);
    pr.f("u_aspAdj", 1 + (q.aspect / 100) * 0.5);
    pr.f("u_vert", q.vertical / 100);
    pr.f("u_horiz", q.horizontal / 100);
    pr.f("u_theta", ((c.angle + q.rotate) * Math.PI) / 180);
    pr.f("u_dist", q.distortion / 100);
    pr.i("u_geo", !isIdentityGeometry(q, true));
  }

  private pass(target: Target | null, pr: Prog) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
    gl.viewport(0, 0, this.outW, this.outH);
    gl.useProgram(pr.p);
  }

  private uploadMasks(p: EditParams) {
    const key = JSON.stringify(p.masks);
    if (key === this.maskKey) return;
    this.maskKey = key;
    const { data, w, h } = maskTextureData(p.masks, this.width, this.height);
    this.bindTex(2, this.maskSrcTex);
    this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, false);
    this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, w, h, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE, data);
  }

  private uploadCurves(p: EditParams) {
    const key = JSON.stringify([p.curve, p.curve_r, p.curve_g, p.curve_b]);
    if (key === this.curveKey) return;
    this.curveKey = key;
    const lut = new Float32Array(256 * 4);
    [p.curve, p.curve_r, p.curve_g, p.curve_b].forEach((c, row) => lut.set(curveLut(c), row * 256));
    const gl = this.gl;
    this.bindTex(3, this.curveTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, 256, 4, 0, gl.RED, gl.FLOAT, lut);
  }

  draw(p: EditParams = defaultParams(), view: View = "normal", seed = 1) {
    if (!this.G || !this.M || !this.T) return;
    const gl = this.gl;
    const aspect = this.width / this.height;
    this.uploadMasks(p);
    this.uploadCurves(p);

    // ── pass 1: geometry + spots + red eye + lens vignette → G
    this.pass(this.G, this.geo);
    this.bindTex(0, this.srcTex);
    this.geo.i("u_src", 0);
    this.setGeometry(this.geo, p, view);
    this.geo.f("u_lensV", p.lens_vignette / 100);
    const spotA = new Float32Array(32 * 4), spotB = new Float32Array(32 * 4);
    p.spots.slice(0, 32).forEach((s, i) => {
      spotA.set([s.x, s.y, s.r, s.feather], i * 4);
      spotB.set([s.sx, s.sy, s.opacity, s.mode === "heal" ? 1 : 0], i * 4);
    });
    this.geo.i("u_nSpots", Math.min(32, p.spots.length));
    this.geo.fv4("u_spotA[0]", spotA); this.geo.fv4("u_spotB[0]", spotB);
    const eyes = new Float32Array(16 * 4);
    p.red_eyes.slice(0, 16).forEach((e, i) => eyes.set([e.x, e.y, e.r, e.amount], i * 4));
    this.geo.i("u_nEyes", Math.min(16, p.red_eyes.length));
    this.geo.fv4("u_eye[0]", eyes);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // ── pass 1m: masks through the same geometry → M
    this.pass(this.M, this.maskP);
    this.bindTex(2, this.maskSrcTex);
    this.maskP.i("u_maskSrc", 2);
    this.setGeometry(this.maskP, p, view);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // ── pass 2: tone → T
    this.pass(this.T, this.tone);
    this.bindTex(0, this.G.tex); this.bindTex(1, this.M.tex);
    this.tone.i("u_g", 0); this.tone.i("u_m", 1);
    const useCal = !isCalDefault(p.cal);
    this.tone.i("u_useCal", useCal);
    this.tone.m3("u_cal", calMatrix(p.cal));
    this.tone.f("u_shadowTint", p.cal.shadow_tint / 100);
    this.tone.f("u_exposure", p.exposure);
    this.tone.f("u_temp", p.temperature / 100); this.tone.f("u_tint", p.tint / 100);
    this.tone.f("u_contrast", p.contrast / 100);
    this.tone.f("u_hl", p.highlights / 100); this.tone.f("u_sh", p.shadows / 100);
    this.tone.f("u_wh", p.whites / 100); this.tone.f("u_bl", p.blacks / 100);
    this.tone.f("u_dehaze", p.dehaze / 100);
    const locA = new Float32Array(16), locB = new Float32Array(16);
    p.masks.slice(0, 4).forEach((m, i) => {
      const a = m.adj;
      const active = m.enabled && Object.values(a).some((v) => v !== 0);
      locA.set([a.exposure, a.contrast / 100, a.highlights / 100, a.shadows / 100], i * 4);
      locB.set([a.temperature / 100, a.tint / 100, a.saturation / 100, active ? 1 : 0], i * 4);
    });
    this.tone.fv4("u_locA[0]", locA); this.tone.fv4("u_locB[0]", locB);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // ── pass 3: detail / color / effects → canvas
    this.pass(null, this.final);
    this.bindTex(0, this.T.tex); this.bindTex(3, this.curveTex);
    const f = this.final;
    f.i("u_t", 0); f.i("u_curve", 3);
    f.v2("u_texel", 1 / this.outW, 1 / this.outH);
    const maxdim = Math.max(this.outW, this.outH);
    f.f("u_maxdim", maxdim); f.f("u_rs", maxdim / 2048); f.f("u_seed", seed);
    f.f("u_nr", p.noise_reduction / 100); f.f("u_clarity", p.clarity / 100); f.f("u_texture", p.texture / 100);
    f.f("u_sharp", p.sharpening / 100); f.f("u_sharpR", p.sharpen_radius);
    f.f("u_vib", p.vibrance / 100); f.f("u_sat", p.saturation / 100);
    f.f("u_vig", p.vignette / 100); f.f("u_grain", p.grain / 100);
    f.i("u_bw", p.bw);
    const hsl = new Float32Array(24);
    let useHsl = false;
    HSL_BANDS.forEach((b, i) => {
      const v = p.hsl[b];
      hsl.set([v.hue, v.sat / 100, v.lum / 100], i * 3);
      if (v.hue || v.sat || v.lum) useHsl = true;
    });
    f.fv3("u_hsl[0]", hsl); f.i("u_useHsl", useHsl);
    const g = p.grade;
    f.i("u_useGrade", isGradeActive(g));
    f.fv3("u_gTint[0]", new Float32Array([...zoneTint(g.shadows), ...zoneTint(g.midtones), ...zoneTint(g.highlights)]));
    f.fv3("u_gLum", new Float32Array([g.shadows.lum / 100, g.midtones.lum / 100, g.highlights.lum / 100]));
    f.f("u_gBlend", g.blending / 100); f.f("u_gBal", g.balance / 100);
    f.v4("u_curveOn", ...[p.curve, p.curve_r, p.curve_g, p.curve_b].map((c) => (isIdentityCurve(c) ? 0 : 1)) as [number, number, number, number]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    void aspect;
  }

  /** 256-bin per-channel histogram of the current drawing buffer. */
  histogram(): { r: Uint32Array; g: Uint32Array; b: Uint32Array } {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const w = this.canvas.width, h = this.canvas.height;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const r = new Uint32Array(256), g = new Uint32Array(256), b = new Uint32Array(256);
    const step = Math.max(1, Math.floor((w * h) / 120000)) * 4;
    for (let i = 0; i < px.length; i += step) { r[px[i]]++; g[px[i + 1]]++; b[px[i + 2]]++; }
    return { r, g, b };
  }

  /** Free GPU resources. Do not lose the context: the canvas may be reused (StrictMode, remounts). */
  dispose() {
    const gl = this.gl;
    [this.srcTex, this.maskSrcTex, this.curveTex].forEach((t) => gl.deleteTexture(t));
    this.freeTarget(this.G); this.freeTarget(this.M); this.freeTarget(this.T);
    [this.geo, this.maskP, this.tone, this.final].forEach((p) => gl.deleteProgram(p.p));
  }
}
