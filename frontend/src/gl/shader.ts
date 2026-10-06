// GPU edit pipeline. Mirrors backend/app/services/render.py (clarity/sharpen/grain are approximations).
export const VERT = `#version 300 es
in vec2 a_pos; out vec2 v_uv;
void main(){ v_uv = a_pos*0.5+0.5; v_uv.y = 1.0 - v_uv.y; gl_Position = vec4(a_pos,0.,1.); }`;

export const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv; out vec4 o;
uniform sampler2D u_tex; uniform sampler2D u_curve;
uniform vec2 u_texel; uniform float u_seed;
uniform float u_exposure,u_temp,u_tint,u_contrast,u_hl,u_sh,u_wh,u_bl,u_clarity,u_vibrance,u_sat,u_sharp,u_vig,u_grain;
uniform vec3 u_hsl[8]; uniform bool u_useHsl; uniform bool u_useCurve; uniform bool u_bw;
const vec3 LUMA = vec3(0.2126,0.7152,0.0722);

vec3 toLin(vec3 c){ return mix(c/12.92, pow((c+0.055)/1.055, vec3(2.4)), step(0.04045, c)); }
vec3 toSrgb(vec3 c){ c = clamp(c,0.,1.); return mix(c*12.92, 1.055*pow(c, vec3(1./2.4))-0.055, step(0.0031308, c)); }

vec3 tone(vec3 src){
  vec3 lin = toLin(src) * exp2(u_exposure);
  lin *= vec3(1.+0.25*u_temp, 1.-0.15*u_tint, 1.-0.25*u_temp);
  vec3 c = toSrgb(lin);
  float L = dot(c, LUMA);
  c += u_sh*0.25*pow(1.-L,2.) + u_hl*0.25*L*L + u_wh*0.15*pow(L,4.) + u_bl*0.15*pow(1.-L,4.);
  c = clamp(c,0.,1.);
  return clamp((c-0.5)*max(0.,1.+u_contrast)+0.5,0.,1.);
}

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

void main(){
  vec3 src = texture(u_tex, v_uv).rgb;
  vec3 c = tone(src);

  if(u_bw) c = vec3(dot(c, LUMA));

  if(abs(u_clarity) > 0.){
    float rad = 2.0 * max(1./u_texel.x, 1./u_texel.y) / 100.;
    vec3 sum = c; float n = 1.;
    for(int i=0;i<12;i++){
      float a = float(i)*0.5236; float r = rad*(i<6?0.5:1.0);
      vec2 off = vec2(cos(a)*r, sin(a)*r)*u_texel;
      sum += tone(texture(u_tex, v_uv+off).rgb); n += 1.;
    }
    vec3 blur = sum/n;
    float mid = 1. - pow(2.*dot(c,LUMA)-1., 2.);
    c = clamp(c + (c-blur)*u_clarity*0.8*mid, 0., 1.);
  }

  float L = dot(c,LUMA);
  float sat = max(c.r,max(c.g,c.b)) - min(c.r,min(c.g,c.b));
  c = vec3(L) + (c-vec3(L))*(1.+u_vibrance*(1.-sat));
  c = clamp(vec3(L) + (c-vec3(L))*(1.+u_sat), 0., 1.);

  if(u_useHsl){
    vec3 hsv = rgb2hsv(c);
    float dh=0., ds=0., dl=0.;
    for(int i=0;i<8;i++){
      float centers[8] = float[8](0.,30.,60.,120.,180.,240.,270.,300.);
      float diff = abs(mod(hsv.x - centers[i] + 180., 360.) - 180.);
      float w = clamp(1.-diff/45.,0.,1.) * clamp(hsv.y,0.,1.);
      dh += w*u_hsl[i].x; ds += w*u_hsl[i].y; dl += w*u_hsl[i].z;
    }
    hsv.x = mod(hsv.x + dh*0.3, 360.);
    hsv.y = clamp(hsv.y*(1.+ds), 0., 1.);
    hsv.z = clamp(hsv.z*(1.+dl*0.5), 0., 1.);
    c = hsv2rgb(hsv);
  }

  if(u_useCurve){
    c = vec3(texture(u_curve, vec2(clamp(c.r,0.,1.)*(255./256.)+0.5/256., 0.5)).r,
             texture(u_curve, vec2(clamp(c.g,0.,1.)*(255./256.)+0.5/256., 0.5)).r,
             texture(u_curve, vec2(clamp(c.b,0.,1.)*(255./256.)+0.5/256., 0.5)).r);
  }

  if(u_sharp > 0.){
    vec3 b = (texture(u_tex, v_uv+vec2(u_texel.x,0.)).rgb + texture(u_tex, v_uv-vec2(u_texel.x,0.)).rgb
            + texture(u_tex, v_uv+vec2(0.,u_texel.y)).rgb + texture(u_tex, v_uv-vec2(0.,u_texel.y)).rgb)*0.25;
    c = clamp(c + (src-b)*u_sharp, 0., 1.);
  }

  if(u_vig != 0.){
    vec2 p = (v_uv-0.5)*2.;
    float d = length(p)/1.4142;
    float f = pow(clamp((d-0.35)/0.65,0.,1.),2.);
    c = clamp(c*(1.+u_vig*f*0.9), 0., 1.);
  }
  if(u_grain > 0.){
    float n = fract(sin(dot(v_uv*1000.+u_seed, vec2(12.9898,78.233)))*43758.5453)*2.-1.;
    c = clamp(c + n*u_grain*0.08, 0., 1.);
  }
  o = vec4(c,1.);
}`;
