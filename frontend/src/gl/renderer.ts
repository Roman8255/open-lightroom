import { curveLut } from "./curve";
import { type EditParams, HSL_BANDS, defaultParams } from "./params";
import { FRAG, VERT } from "./shader";

const isIdentityCurve = (c: [number, number][]) => c.length === 2 && c[0][1] === 0 && c[1][1] === 1;

export class GLRenderer {
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private tex: WebGLTexture;
  private curveTex: WebGLTexture;
  private loc: Record<string, WebGLUniformLocation | null> = {};
  private texel: [number, number] = [1, 1];
  private lastCurveKey = "";
  width = 0;
  height = 0;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true, antialias: false });
    if (!gl) throw new Error("WebGL2 is not supported in this browser");
    this.gl = gl;
    this.prog = this.link(VERT, FRAG);
    gl.useProgram(this.prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(this.prog, "a_pos");
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    this.tex = this.makeTex(0);
    this.curveTex = this.makeTex(1);
    gl.uniform1i(this.u("u_tex"), 0);
    gl.uniform1i(this.u("u_curve"), 1);
  }

  private u(name: string) {
    if (!(name in this.loc)) this.loc[name] = this.gl.getUniformLocation(this.prog, name);
    return this.loc[name];
  }

  private link(vs: string, fs: string): WebGLProgram {
    const gl = this.gl;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader error");
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link error");
    return p;
  }

  private makeTex(unit: number): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  setImage(img: HTMLImageElement) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    this.width = img.naturalWidth;
    this.height = img.naturalHeight;
  }

  /** Resize the drawing buffer (device pixels), keeping the image aspect. */
  resize(w: number, h: number) {
    this.canvas.width = Math.max(1, Math.round(w));
    this.canvas.height = Math.max(1, Math.round(h));
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.texel = [1 / this.width, 1 / this.height];
  }

  draw(p: EditParams = defaultParams()) {
    const gl = this.gl;
    const u = (n: string) => this.u(n);
    gl.uniform2f(u("u_texel"), this.texel[0], this.texel[1]);
    gl.uniform1f(u("u_seed"), 1.0);
    gl.uniform1f(u("u_exposure"), p.exposure);
    gl.uniform1f(u("u_temp"), p.temperature / 100);
    gl.uniform1f(u("u_tint"), p.tint / 100);
    gl.uniform1f(u("u_contrast"), p.contrast / 100);
    gl.uniform1f(u("u_hl"), p.highlights / 100);
    gl.uniform1f(u("u_sh"), p.shadows / 100);
    gl.uniform1f(u("u_wh"), p.whites / 100);
    gl.uniform1f(u("u_bl"), p.blacks / 100);
    gl.uniform1f(u("u_clarity"), p.clarity / 100);
    gl.uniform1f(u("u_vibrance"), p.vibrance / 100);
    gl.uniform1f(u("u_sat"), p.saturation / 100);
    gl.uniform1f(u("u_sharp"), p.sharpening / 100);
    gl.uniform1f(u("u_vig"), p.vignette / 100);
    gl.uniform1f(u("u_grain"), p.grain / 100);
    gl.uniform1i(u("u_bw"), p.bw ? 1 : 0);

    const hsl = new Float32Array(24);
    let useHsl = false;
    HSL_BANDS.forEach((b, i) => {
      const v = p.hsl[b];
      hsl.set([v.hue, v.sat / 100, v.lum / 100], i * 3);
      if (v.hue || v.sat || v.lum) useHsl = true;
    });
    gl.uniform3fv(u("u_hsl[0]"), hsl);
    gl.uniform1i(u("u_useHsl"), useHsl ? 1 : 0);

    const useCurve = !isIdentityCurve(p.curve);
    gl.uniform1i(u("u_useCurve"), useCurve ? 1 : 0);
    if (useCurve) {
      const key = JSON.stringify(p.curve);
      if (key !== this.lastCurveKey) {
        this.lastCurveKey = key;
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.curveTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, 256, 1, 0, gl.RED, gl.FLOAT, curveLut(p.curve));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      }
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** 256-bin per-channel histogram of the current drawing buffer. */
  histogram(): { r: Uint32Array; g: Uint32Array; b: Uint32Array } {
    const gl = this.gl;
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
    this.gl.deleteTexture(this.tex);
    this.gl.deleteTexture(this.curveTex);
    this.gl.deleteProgram(this.prog);
  }
}
