// Multi-pass GPU pipeline. Mirrors backend/app/services/render.py stage by stage.
//   pass 1  GEO   : crop/transform/distortion + spots + red-eye + lens vignette  -> G
//   pass 1m MASK  : source-space mask texture resampled through the same geometry -> M
//   pass 2  TONE  : calibration, tone, dehaze, local mask adjustments            -> T
//   pass 3  FINAL : detail, color, HSL, grading, curves, effects                 -> canvas
// Render targets use texture coords t=(0..1) with t.y=0 at the bottom; image-space uv has y down: uv=(t.x, 1-t.y).

export const VERT = `#version 300 es
in vec2 a_pos; out vec2 v_t;
void main(){ v_t = a_pos*0.5+0.5; gl_Position = vec4(a_pos,0.,1.); }`;

const HEAD = `#version 300 es
precision highp float; precision highp sampler2D;
in vec2 v_t; out vec4 o;
const vec3 LUMA = vec3(0.2126,0.7152,0.0722);
`;

const GEO_FN = `
uniform vec4 u_crop; uniform vec4 u_view; uniform float u_aspect, u_scale, u_aspAdj, u_vert, u_horiz, u_theta, u_dist; uniform bool u_geo;
vec2 geo(vec2 uv){
  uv = u_view.xy + uv*u_view.zw; // zoom: visible sub-rectangle of the frame
  vec2 p = u_crop.xy + uv*u_crop.zw;
  if(!u_geo) return p;
  vec2 q = (p-0.5)*vec2(u_aspect,1.);
  q /= u_scale; q.x /= u_aspAdj;
  vec2 n = vec2(q.x*(1.+u_vert*0.5*q.y), q.y*(1.+u_horiz*0.5*q.x));
  float c = cos(u_theta), s = sin(u_theta);
  vec2 r = vec2(c*n.x + s*n.y, -s*n.x + c*n.y);
  float r2 = dot(r,r)/(0.25*(u_aspect*u_aspect+1.));
  r *= 1. + u_dist*0.35*r2;
  return r/vec2(u_aspect,1.) + 0.5;
}`;

export const FRAG_GEO = `${HEAD}${GEO_FN}
uniform sampler2D u_src;
uniform float u_lensV;
uniform int u_nSpots; uniform vec4 u_spotA[32]; uniform vec4 u_spotB[32]; // A=(x,y,r,feather) B=(sx,sy,opacity,heal)
uniform int u_nEyes; uniform vec4 u_eye[16];                               // (x,y,r,amount)
void main(){
  vec2 uv = vec2(v_t.x, 1.-v_t.y);
  vec2 s = geo(uv);
  vec3 c = texture(u_src, s).rgb;
  if(s.x<0.||s.x>1.||s.y<0.||s.y>1.) c = vec3(0.11);
  vec2 asp = vec2(u_aspect,1.);
  for(int i=0;i<32;i++){
    if(i>=u_nSpots) break;
    vec4 A = u_spotA[i], B = u_spotB[i];
    float d = length((s-A.xy)*asp)/A.z;
    float w = (1.-smoothstep(1.-max(A.w,0.02),1.,d))*B.z;
    if(w>0.){
      vec3 smp = texture(u_src, s + (B.xy-A.xy)).rgb;
      if(B.w>0.5){
        vec2 o1 = vec2(A.z/u_aspect,0.), o2 = vec2(0.,A.z);
        vec3 dst = (texture(u_src,A.xy+o1).rgb+texture(u_src,A.xy-o1).rgb+texture(u_src,A.xy+o2).rgb+texture(u_src,A.xy-o2).rgb)*0.25;
        vec3 srm = (texture(u_src,B.xy+o1).rgb+texture(u_src,B.xy-o1).rgb+texture(u_src,B.xy+o2).rgb+texture(u_src,B.xy-o2).rgb)*0.25;
        smp += dst - srm;
      }
      c = clamp(mix(c, smp, w), 0., 1.);
    }
  }
  for(int i=0;i<16;i++){
    if(i>=u_nEyes) break;
    vec4 E = u_eye[i];
    float m = (1.-smoothstep(0.6,1.,length((s-E.xy)*asp)/E.z))*E.w;
    if(m>0.){
      float k = clamp((c.r-max(c.g,c.b))*4.,0.,1.)*m;
      float t = max(c.g,c.b)*0.6;
      c.r += (t-c.r)*k; c.g *= 1.-0.4*k; c.b *= 1.-0.4*k;
    }
  }
  if(u_lensV != 0.){
    float rn = length((s-0.5)*asp)/(0.5*sqrt(u_aspect*u_aspect+1.));
    c = clamp(c*(1.+u_lensV*0.8*rn*rn), 0., 1.);
  }
  o = vec4(c,1.);
}`;

export const FRAG_MASK = `${HEAD}${GEO_FN}
uniform sampler2D u_maskSrc;
void main(){ o = texture(u_maskSrc, geo(vec2(v_t.x, 1.-v_t.y))); }`;

export const FRAG_TONE = `${HEAD}
uniform sampler2D u_g, u_m;
uniform bool u_useCal; uniform mat3 u_cal; uniform float u_shadowTint;
uniform float u_exposure,u_temp,u_tint,u_contrast,u_hl,u_sh,u_wh,u_bl,u_dehaze;
uniform vec4 u_locA[4]; // exposure, contrast, highlights, shadows
uniform vec4 u_locB[4]; // temp, tint, saturation, enabled

vec3 toLin(vec3 c){ return mix(c/12.92, pow((c+0.055)/1.055, vec3(2.4)), step(0.04045, c)); }
vec3 toSrgb(vec3 c){ c = clamp(c,0.,1.); return mix(c*12.92, 1.055*pow(c, vec3(1./2.4))-0.055, step(0.0031308, c)); }

vec3 toneStage(vec3 c, float ex, float t, float ti, float ct, float hl, float sh, float wh, float bl){
  vec3 lin = toLin(c) * exp2(ex);
  lin *= vec3(1.+0.25*t, 1.-0.15*ti, 1.-0.25*t);
  c = toSrgb(lin);
  float L = dot(c, LUMA);
  c += sh*0.25*pow(1.-L,2.) + hl*0.25*L*L + wh*0.15*pow(L,4.) + bl*0.15*pow(1.-L,4.);
  c = clamp(c,0.,1.);
  return clamp((c-0.5)*max(0.,1.+ct)+0.5,0.,1.);
}

void main(){
  vec3 c = texture(u_g, v_t).rgb;
  if(u_useCal){
    c = clamp(u_cal*c, 0., 1.);
    float L = dot(c,LUMA);
    c.g = clamp(c.g + u_shadowTint*0.06*(1.-L)*(1.-L), 0., 1.);
  }
  c = toneStage(c, u_exposure,u_temp,u_tint,u_contrast,u_hl,u_sh,u_wh,u_bl);
  if(u_dehaze > 0.){
    float dark = min(c.r,min(c.g,c.b));
    float t = clamp(1.-u_dehaze*dark/0.9, 0.25, 1.);
    c = clamp((c-0.9)/t+0.9, 0., 1.);
  } else if(u_dehaze < 0.){
    c += (0.8-c)*(-u_dehaze*0.35);
  }
  vec4 m4 = texture(u_m, v_t);
  for(int i=0;i<4;i++){
    if(u_locB[i].w < 0.5) continue;
    float m = m4[i];
    vec4 A = u_locA[i], B = u_locB[i];
    vec3 a = toneStage(c, A.x, B.x, B.y, A.y, A.z, A.w, 0., 0.);
    float L = dot(a,LUMA);
    a = clamp(vec3(L)+(a-vec3(L))*(1.+B.z), 0., 1.);
    c += (a-c)*m;
  }
  o = vec4(c,1.);
}`;

export const FRAG_FINAL = `${HEAD}
uniform sampler2D u_t, u_curve;
uniform vec2 u_texel; uniform float u_rs, u_maxdim, u_seed;
uniform float u_nr,u_clarity,u_texture,u_sharp,u_sharpR,u_vib,u_sat,u_vig,u_grain;
uniform bool u_bw, u_useHsl, u_useGrade;
uniform vec3 u_hsl[8];
uniform vec3 u_gTint[3]; uniform vec3 u_gLum; uniform float u_gBlend, u_gBal;
uniform vec4 u_curveOn; // master, r, g, b
uniform vec4 u_view; uniform bool u_clip;
const float CENTERS[8] = float[8](0.,30.,60.,120.,180.,240.,270.,300.);

vec3 tx(vec2 off){ return texture(u_t, v_t + off*u_texel).rgb; }

vec3 rgb2hsv(vec3 c){
  float mx=max(c.r,max(c.g,c.b)), mn=min(c.r,min(c.g,c.b)), d=mx-mn, h=0.;
  if(d>0.){
    if(mx==c.r) h=mod((c.g-c.b)/d,6.); else if(mx==c.g) h=(c.b-c.r)/d+2.; else h=(c.r-c.g)/d+4.;
  }
  return vec3(h*60., mx==0.?0.:d/mx, mx);
}
vec3 hsv2rgb(vec3 c){
  float h=c.x/60.;
  vec3 k = mod(vec3(5.,3.,1.)+h, 6.);
  return c.z - c.z*c.y*clamp(min(k,4.-k),0.,1.);
}
float lut(float x, float row){ return texture(u_curve, vec2((clamp(x,0.,1.)*255.+0.5)/256., (row+0.5)/4.)).r; }

void main(){
  vec3 c = texture(u_t, v_t).rgb;
  const float TAU = 6.2831853;

  if(u_nr > 0.){
    vec3 sum = c; 
    for(int i=0;i<8;i++){ float a = float(i)*TAU/8.; sum += tx(vec2(cos(a),sin(a))*3.*u_rs); }
    vec3 blur = sum/9.; vec3 d = c-blur;
    float w = exp(-dot(d,d)/(0.0005+0.01*u_nr));
    c += (blur-c)*w*u_nr;
  }
  if(abs(u_clarity) > 0.){
    float rad = 2.*u_maxdim/100.;
    vec3 sum = c;
    for(int i=0;i<12;i++){ float a = float(i)*0.5236; float r = rad*(i<6?0.5:1.0); sum += tx(vec2(cos(a),sin(a))*r); }
    vec3 blur = sum/13.;
    float mid = 1. - pow(2.*dot(c,LUMA)-1., 2.);
    c = clamp(c + (c-blur)*u_clarity*0.8*mid, 0., 1.);
  }
  if(abs(u_texture) > 0.){
    vec3 sum = c;
    for(int i=0;i<8;i++){ float a = float(i)*TAU/8.; sum += tx(vec2(cos(a),sin(a))*2.5*u_rs); }
    c = clamp(c + (c-sum/9.)*u_texture, 0., 1.);
  }
  if(u_sharp > 0.){
    float r = 1.2*u_sharpR*u_rs;
    vec3 b = (tx(vec2(r,0.))+tx(vec2(-r,0.))+tx(vec2(0.,r))+tx(vec2(0.,-r)))*0.25;
    c = clamp(c + (c-b)*u_sharp, 0., 1.);
  }

  float L = dot(c,LUMA);
  float sat = max(c.r,max(c.g,c.b)) - min(c.r,min(c.g,c.b));
  c = vec3(L) + (c-vec3(L))*(1.+u_vib*(1.-sat));
  c = clamp(vec3(L) + (c-vec3(L))*(1.+u_sat), 0., 1.);

  if(u_useHsl || u_bw){
    vec3 hsv = rgb2hsv(c);
    float dh=0., ds=0., dl=0.;
    for(int i=0;i<8;i++){
      float diff = abs(mod(hsv.x - CENTERS[i] + 180., 360.) - 180.);
      float w = clamp(1.-diff/45.,0.,1.) * clamp(hsv.y,0.,1.);
      dh += w*u_hsl[i].x; ds += w*u_hsl[i].y; dl += w*u_hsl[i].z;
    }
    if(u_bw){
      c = vec3(clamp(dot(c,LUMA)*(1.+dl*0.8), 0., 1.));
    } else {
      hsv.x = mod(hsv.x + dh*0.3, 360.);
      hsv.y = clamp(hsv.y*(1.+ds), 0., 1.);
      hsv.z = clamp(hsv.z*(1.+dl*0.5), 0., 1.);
      c = hsv2rgb(hsv);
    }
  }

  if(u_useGrade){
    float l = dot(c,LUMA);
    float pivot = 0.5+u_gBal*0.25, width = 0.2+u_gBlend*0.3;
    float ws = 1.-smoothstep(pivot-width, pivot, l);
    float wh = smoothstep(pivot, pivot+width, l);
    float wm = clamp(1.-ws-wh, 0., 1.);
    c = clamp(c + (u_gTint[0]*0.35+u_gLum.x*0.2)*ws + (u_gTint[1]*0.35+u_gLum.y*0.2)*wm + (u_gTint[2]*0.35+u_gLum.z*0.2)*wh, 0., 1.);
  }

  if(u_curveOn.x > 0.5) c = vec3(lut(c.r,0.), lut(c.g,0.), lut(c.b,0.));
  if(u_curveOn.y > 0.5) c.r = lut(c.r,1.);
  if(u_curveOn.z > 0.5) c.g = lut(c.g,2.);
  if(u_curveOn.w > 0.5) c.b = lut(c.b,3.);

  if(u_vig != 0.){
    vec2 p = ((u_view.xy + vec2(v_t.x,1.-v_t.y)*u_view.zw)-0.5)*2.;
    float d = length(p)/1.4142;
    float f = pow(clamp((d-0.35)/0.65,0.,1.),2.);
    c = clamp(c*(1.+u_vig*f*0.9), 0., 1.);
  }
  if(u_grain > 0.){
    float n = fract(sin(dot(v_t*1000.+u_seed, vec2(12.9898,78.233)))*43758.5453)*2.-1.;
    c = clamp(c + n*u_grain*0.08, 0., 1.);
  }
  if(u_clip){
    if(max(c.r,max(c.g,c.b)) >= 0.99) c = vec3(1.,0.,0.);
    else if(min(c.r,min(c.g,c.b)) <= 0.01) c = vec3(0.,0.3,1.);
  }
  o = vec4(c,1.);
}`;
