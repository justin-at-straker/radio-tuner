#version 300 es
precision highp float;
in vec3 vWorld;
in vec3 vNormal;
in vec3 vObjN;
in vec2 vUv;
in vec3 vLocal;
out vec4 outColor;

uniform int uMode;
uniform sampler2D uTex; // the HTML panel's picture
uniform sampler2D uEnv; // studio HDRI, equirect, blurred mips
uniform float uEnvMaxLod;
uniform float uEnvRot;
uniform float uEnvGain;
uniform sampler2D uWoodD, uWoodN, uWoodR;
uniform mat4 uCab; // the cabinet's model matrix (rotation only)
uniform mat4 uCabInv;
uniform vec3 uCam;
uniform vec3 uGlowPos;
uniform vec3 uFront;
uniform float uPower;
uniform float uTime;
uniform float uLevel;
uniform float uStrength;
uniform float uHiss;
uniform float uNeedle;
uniform vec2 uSize;
uniform float uExposure;
// the room
uniform mat4 uInvViewProj;
uniform float uSkyLod;
uniform float uAspect;
uniform float uRoomGain;
uniform sampler2D uRoomTex; // the room, rendered, mipmapped for blur
uniform sampler2D uMatD, uMatN, uMatR; // the current prop or surface's maps
uniform vec4 uTint;
uniform float uTile;
uniform vec3 uEmit;
uniform vec3 uLightPos[4];
uniform vec3 uLightCol[4];
uniform int uLinearOut;
uniform int uDepthOnly;            // the lamp's shadow pass: depth only, no shading
uniform highp sampler2DShadow uShadowMap;
uniform mat4 uLightVP;             // world -> the lamp's shadow map
uniform float uShadowTexel;
uniform int uReflect;
uniform float uReflectY;
float gAlpha = 1.0;
uniform vec3 uKeyDir;     // the fire's light, roughly
uniform vec3 uKeyCol;
uniform vec4 uOcc[4];     // things on the table: centre x, z, half width, half depth
uniform vec4 uOccB[4];    // ... and turn, corner radius, height, lift
float gKeyShadow = 1.0;   // set per surface: 0 where the radio blocks the key light

const float PI = 3.14159265;

float hash1(float n) { return fract(sin(n) * 43758.5453); }
float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float noise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; }
  return s;
}
vec3 srgbToLinear(vec3 c) { return pow(c, vec3(2.2)); }

// ---------------------------------------------------------------- environment

vec3 env(vec3 d, float lod) {
  float c = cos(uEnvRot), s = sin(uEnvRot);
  d = vec3(c * d.x + s * d.z, d.y, -s * d.x + c * d.z);
  vec2 uv = vec2(atan(d.x, -d.z) / (2.0 * PI) + 0.5, acos(clamp(d.y, -1.0, 1.0)) / PI);
  return textureLod(uEnv, uv, lod).rgb * uEnvGain;
}
vec3 envSpec(vec3 r, float rough) { return env(r, sqrt(rough) * (uEnvMaxLod - 1.0)); }
vec3 envDiffuse(vec3 n) { return env(n, uEnvMaxLod - 1.5); }

vec3 envBrdf(vec3 F0, float rough, float NoV) {
  const vec4 c0 = vec4(-1.0, -0.0275, -0.572, 0.022);
  const vec4 c1 = vec4(1.0, 0.0425, 1.04, -0.04);
  vec4 r = rough * c0 + c1;
  float a004 = min(r.x * r.x, exp2(-9.28 * NoV)) * r.x + r.y;
  vec2 AB = vec2(-1.04, 1.04) * a004 + r.zw;
  return F0 * AB.x + AB.y;
}

// ---------------------------------------------------------------- surfaces

struct Surf {
  vec3 albedo;
  vec3 N;  // shading normal (with texture detail)
  vec3 Ng; // the smooth normal under a clear coat
  float rough;
  float metal;
  float coat;
  float ao;
  vec3 emit;
};

vec3 direct(Surf s, vec3 V, vec3 L, vec3 radiance) {
  float NoL = max(dot(s.N, L), 0.0);
  if (NoL <= 0.0) return vec3(0.0);
  vec3 H = normalize(V + L);
  float NoV = max(dot(s.N, V), 1e-3);
  float NoH = max(dot(s.N, H), 0.0);
  float a = s.rough * s.rough;
  float a2 = a * a;
  float d = NoH * NoH * (a2 - 1.0) + 1.0;
  float D = a2 / (PI * d * d);
  float k = (s.rough + 1.0) * (s.rough + 1.0) / 8.0;
  float G = (NoV / (NoV * (1.0 - k) + k)) * (NoL / (NoL * (1.0 - k) + k));
  vec3 F0 = mix(vec3(0.04), s.albedo, s.metal);
  vec3 F = F0 + (1.0 - F0) * pow(1.0 - max(dot(H, V), 0.0), 5.0);
  vec3 spec = D * G * F / max(4.0 * NoV * NoL, 1e-4);
  vec3 kd = (1.0 - F) * (1.0 - s.metal);
  return (kd * s.albedo / PI + spec) * radiance * NoL;
}

float coatSpec(vec3 N, vec3 V, vec3 L) {
  vec3 H = normalize(V + L);
  float NoH = max(dot(N, H), 0.0);
  return pow(NoH, 600.0) * 6.0 * max(dot(N, L), 0.0);
}

vec3 shade(Surf s) {
  vec3 V = normalize(uCam - vWorld);
  float NoV = max(dot(s.N, V), 1e-3);
  vec3 F0 = mix(vec3(0.04), s.albedo, s.metal);
  vec3 spec = envSpec(reflect(-V, s.N), s.rough) * envBrdf(F0, s.rough, NoV);
  vec3 diff = envDiffuse(s.N) * s.albedo * (1.0 - s.metal);
  vec3 c = (diff + spec) * s.ao;

  vec3 key = uKeyDir;
  c += direct(s, V, key, uKeyCol) * gKeyShadow;
  vec3 Lp = uGlowPos - vWorld;
  float dl = length(Lp);
  vec3 lamp = vec3(1.0, 0.55, 0.22) * uPower * (0.8 + uLevel) * 1.4 / (1.0 + dl * dl * 9.0);
  c += direct(s, V, Lp / dl, lamp);
  for (int i = 0; i < 4; i++) {
    vec3 L = uLightPos[i] - vWorld;
    float d = length(L);
    c += direct(s, V, L / d, uLightCol[i] / (1.0 + d * d * 0.06));
  }

  if (s.coat > 0.0) {
    float Fc = 0.04 + 0.96 * pow(1.0 - max(dot(s.Ng, V), 0.0), 5.0);
    c *= 1.0 - s.coat * Fc;
    c += s.coat * Fc * envSpec(reflect(-V, s.Ng), 0.06) * 0.6;
    c += s.coat * coatSpec(s.Ng, V, key) * uKeyCol * 0.05 * gKeyShadow;
    c += s.coat * coatSpec(s.Ng, V, Lp / dl) * lamp * 0.04;
  }
  return c + s.emit;
}

// ---------------------------------------------------------------- wood (triplanar in cabinet space)

vec3 cabPos() { return (uCabInv * vec4(vWorld, 1.0)).xyz; }
vec3 toWorld(vec3 nCab) { return normalize(mat3(uCab) * nCab); }

Surf rosewood(vec3 p, vec3 nCab, float lacquer) {
  vec3 w = pow(abs(nCab), vec3(6.0));
  w /= w.x + w.y + w.z;
  float t = 0.8;
  vec2 ux = vec2(p.z, -p.y) * t, uy = vec2(p.x, p.z) * t, uz = vec2(p.x, -p.y) * t;
  vec3 alb = texture(uWoodD, ux).rgb * w.x + texture(uWoodD, uy).rgb * w.y + texture(uWoodD, uz).rgb * w.z;
  float r = texture(uWoodR, ux).r * w.x + texture(uWoodR, uy).r * w.y + texture(uWoodR, uz).r * w.z;
  vec2 nx = texture(uWoodN, ux).xy * 2.0 - 1.0;
  vec2 ny = texture(uWoodN, uy).xy * 2.0 - 1.0;
  vec2 nz = texture(uWoodN, uz).xy * 2.0 - 1.0;
  vec3 pert = w.x * vec3(0.0, -nx.y, nx.x) + w.y * vec3(ny.x, 0.0, ny.y) + w.z * vec3(nz.x, -nz.y, 0.0);
  Surf s;
  s.albedo = pow(alb, vec3(1.25)) * 0.6; // lacquer deepens the colour
  s.N = toWorld(normalize(nCab + pert * 0.8));
  s.Ng = toWorld(nCab);
  s.rough = mix(0.45, 0.7, r);
  s.metal = 0.0;
  s.coat = lacquer;
  s.ao = 1.0;
  s.emit = vec3(0.0);
  return s;
}

// Normal maps without tangents: build the frame from screen-space derivatives.
vec3 perturb(vec3 N, vec3 p, vec2 uv, vec3 tn) {
  vec3 dp1 = dFdx(p), dp2 = dFdy(p);
  vec2 duv1 = dFdx(uv), duv2 = dFdy(uv);
  vec3 dp2perp = cross(dp2, N), dp1perp = cross(N, dp1);
  vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;
  vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;
  float invmax = inversesqrt(max(max(dot(T, T), dot(B, B)), 1e-12));
  return normalize(mat3(T * invmax, B * invmax, N) * tn);
}

Surf plain(vec3 albedo, vec3 n, float rough) {
  Surf s;
  s.albedo = albedo;
  s.N = n;
  s.Ng = n;
  s.rough = rough;
  s.metal = 0.0;
  s.coat = 0.0;
  s.ao = 1.0;
  s.emit = vec3(0.0);
  return s;
}

// How much of the lamp reaches this point: a 4x4 filtered lookup in its shadow map.
float lampLight(vec3 p, vec3 n) {
  vec4 lp = uLightVP * vec4(p + n * 0.015, 1.0);
  vec3 q = lp.xyz / lp.w * 0.5 + 0.5;
  if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0 || q.z > 1.0) return 1.0;
  float sum = 0.0;
  for (int y = 0; y < 4; y++)
    for (int x = 0; x < 4; x++)
      sum += texture(uShadowMap, vec3(q.xy + (vec2(x, y) - 1.5) * uShadowTexel * 1.4, q.z - 0.0015));
  return sum / 16.0;
}

void main() {
  if (uDepthOnly == 1) {
    outColor = vec4(0.0);
    return;
  }
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  // the lamp is shadowed by whatever stands between it and here (not in
  // reflections, or in the room, which it doesn't light)
  if (uLinearOut == 0 && uReflect == 0) gKeyShadow = lampLight(vWorld, n);
  vec3 V = normalize(uCam - vWorld);
  vec3 c;

  if (uMode == 11) {
    // the room, out of focus: a disc of taps over a blurred mip, like a fast lens
    vec2 uv = vUv * 0.5 + 0.5;
    vec2 px = vec2(1.0 / uAspect, 1.0) * 0.022;
    c = textureLod(uRoomTex, uv, 1.0).rgb * 2.0;
    for (int i = 0; i < 12; i++) {
      float a = float(i) * 2.39996;
      float rr = sqrt((float(i) + 0.5) / 12.0);
      c += textureLod(uRoomTex, uv + vec2(cos(a), sin(a)) * rr * px, 1.5).rgb;
    }
    c /= 14.0;

  } else if (uMode == 10) {
    // the coffee table: dark polished wood, a soft contact shadow, the dial's warm pool
    vec2 uv = vWorld.xz * 0.35 + vec2(0.0, vWorld.y * 0.5);
    vec3 alb = pow(texture(uMatD, uv).rgb, vec3(1.2)) * 0.42;
    vec2 tn = texture(uMatN, uv).xy * 2.0 - 1.0;
    float top = smoothstep(0.8, 0.98, n.y);
    vec3 tableN = normalize(mix(n, normalize(vec3(tn.x * 0.7, 1.0, -tn.y * 0.7)), top));
    Surf s = plain(alb, tableN, mix(0.3, 0.6, texture(uMatR, uv).r));
    s.Ng = n;
    s.coat = 0.85;
    // contact shadows from everything standing on the table: each one a
    // rounded footprint (uOcc: centre x, z, half width, half depth; uOccB:
    // turn, corner radius, height, how much it's lifted off the table)
    vec2 throwDir = -uKeyDir.xz / max(uKeyDir.y, 0.25);
    float occ = 1.0;
    float keyOcc = 1.0;
    for (int i = 0; i < 4; i++) {
      vec4 o = uOcc[i];
      vec4 b = uOccB[i];
      if (o.z <= 0.0) continue;
      float lifted = b.w;
      float ca = cos(b.x), sa = sin(b.x);
      vec2 rel = vWorld.xz - o.xy;
      vec2 p = vec2(ca * rel.x - sa * rel.y, sa * rel.x + ca * rel.y);
      vec2 q = abs(p) - (o.zw - b.y);
      float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - b.y;
      float fade = exp(-lifted * 3.0);
      // a tight dark line where it touches, then a soft spread of occlusion
      float touch = exp(-max(sd, 0.0) / 0.025) * exp(-lifted * 40.0);
      float spread = exp(-max(sd, 0.0) / (0.12 + b.z * 0.35 + lifted * 0.6));
      occ *= 1.0 - (0.7 * spread * fade + 0.25 * touch);
      // the lamp's shadow, thrown away from it
      vec2 rel2 = rel - throwDir * (b.z * 0.5 + lifted);
      vec2 p2 = vec2(ca * rel2.x - sa * rel2.y, sa * rel2.x + ca * rel2.y);
      vec2 q2 = abs(p2) - (o.zw - b.y);
      float sd2 = length(max(q2, 0.0)) + min(max(q2.x, q2.y), 0.0) - b.y;
      keyOcc *= 1.0 - 0.85 * smoothstep(0.08 + b.z * 0.3, -0.05, sd2) * fade;
    }
    keyOcc = 1.0;
    s.ao = occ;
    s.ao *= mix(0.35, 1.0, top);  // the rim and underside sit in shadow
    c = shade(s);
    // the occluders block the fire and lamps too, not just the ambient light
    c *= mix(1.0, occ, 0.7);
    // the reflection underneath shows through the lacquer, more at a low angle
    float Fr = 0.04 + 0.96 * pow(1.0 - max(dot(s.Ng, V), 0.0), 5.0);
    gAlpha = 1.0 - top * clamp(0.06 + Fr * 0.35, 0.0, 0.3);

  } else if (uMode == 12) {
    // a scanned prop: diffuse, normal and ARM (occlusion, roughness, metal) maps
    vec4 d = texture(uMatD, vUv) * uTint;
    vec3 arm = texture(uMatR, vUv).rgb;
    vec3 tn = texture(uMatN, vUv).xyz * 2.0 - 1.0;
    Surf s = plain(d.rgb, perturb(n, vWorld, vUv, tn), clamp(arm.g, 0.05, 1.0));
    s.metal = arm.b;
    s.ao = arm.r;
    c = shade(s);

  } else if (uMode == 13) {
    // a small flame (candle, oil lamp): bright, flickering, additive
    float f = 0.8 + 0.2 * sin(uTime * 23.0 + vWorld.x * 7.0) * sin(uTime * 11.0);
    c = vec3(3.0, 1.4, 0.4) * f;
    gAlpha = 1.0;

  } else if (uMode == 14) {
    // glass: mostly reflection, a little tint, mostly see-through
    float F = 0.04 + 0.96 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
    c = envSpec(reflect(-V, n), 0.03) * (0.4 + F) + texture(uMatD, vUv).rgb * 0.05;
    gAlpha = clamp(0.12 + F * 0.8, 0.0, 1.0);

  } else if (uMode == 15) {
    // a tiled surface (floor, walls, stone, rug), mapped from three directions in world space
    vec3 w = pow(abs(n), vec3(4.0));
    w /= w.x + w.y + w.z;
    vec3 p = vWorld / uTile;
    vec2 ux = vec2(p.z, -p.y), uy = vec2(p.x, p.z), uz = vec2(p.x, -p.y);
    vec3 alb = (texture(uMatD, ux).rgb * w.x + texture(uMatD, uy).rgb * w.y + texture(uMatD, uz).rgb * w.z) * uTint.rgb;
    vec3 arm = texture(uMatR, ux).rgb * w.x + texture(uMatR, uy).rgb * w.y + texture(uMatR, uz).rgb * w.z;
    vec2 nx = texture(uMatN, ux).xy * 2.0 - 1.0, ny = texture(uMatN, uy).xy * 2.0 - 1.0, nz = texture(uMatN, uz).xy * 2.0 - 1.0;
    vec3 pert = w.x * vec3(0.0, -nx.y, nx.x) * sign(n.x) + w.y * vec3(ny.x, 0.0, ny.y) + w.z * vec3(nz.x, -nz.y, 0.0) * sign(n.z);
    Surf s = plain(alb, normalize(n + pert * 0.9), clamp(arm.g, 0.05, 1.0));
    s.ao = arm.r;
    s.emit = uEmit * (0.7 + 0.6 * noise(vec3(vWorld.xy * 3.0, uTime * 2.0)));
    c = shade(s);

  } else if (uMode == 16) {
    // fir needles: dark green, finely broken up
    float needles = noise(vec3(vUv.x * 300.0, vUv.y * 60.0, 0.0)) * 0.6 + noise(vec3(vLocal * 9.0)) * 0.4;
    vec3 tn = normalize(vec3((noise(vec3(vUv * vec2(400.0, 80.0), 1.0)) - 0.5) * 1.6, (noise(vec3(vUv * vec2(400.0, 80.0), 2.0)) - 0.5) * 1.6, 1.0));
    Surf s = plain(vec3(0.02, 0.055, 0.025) * (0.5 + needles), normalize(n + tn * 0.6 - n * 0.3), 0.6);
    s.ao = 0.4 + 0.6 * vUv.y;
    c = shade(s);

  } else if (uMode == 17) {
    // baubles: red and gold glass, glossy
    float id = vUv.x;
    bool gold = hash1(id * 3.1) > 0.55;
    Surf s = plain(gold ? vec3(0.9, 0.62, 0.22) : vec3(0.55, 0.03, 0.02), n, 0.18);
    s.metal = gold ? 1.0 : 0.3;
    s.coat = 1.0;
    c = shade(s);

  } else if (uMode == 18) {
    // fairy lights, twinkling one by one
    float id = vUv.x;
    float tw = 0.55 + 0.45 * sin(uTime * (1.0 + hash1(id) * 2.5) + hash1(id + 9.0) * 6.28);
    c = vec3(3.2, 2.0, 0.85) * tw;

  } else if (uMode == 19) {
    // the window: a snowy night, snow falling past the glass
    vec2 u = vUv;
    vec3 night = mix(vec3(0.05, 0.07, 0.13), vec3(0.2, 0.24, 0.32), smoothstep(0.6, 1.0, u.y));
    float drift = smoothstep(0.75, 1.0, u.y + 0.06 * noise(vec3(u.x * 12.0, 0.0, 0.0)));
    float trees = smoothstep(0.02, 0.0, (1.0 - u.y) - 0.35 - 0.12 * noise(vec3(u.x * 18.0, 3.0, 0.0)));
    night = mix(night, vec3(0.015, 0.025, 0.04), trees * 0.8);
    night = mix(night, vec3(0.45, 0.5, 0.6), drift);
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float sc = 18.0 + fi * 14.0;
      vec2 sn = vec2(u.x * sc + sin(uTime * 0.5 + u.y * 6.0 + fi) * 0.3, u.y * sc * 1.3 + uTime * (0.8 + fi * 0.4));
      vec2 cell = floor(sn);
      vec2 j = vec2(hash(vec3(cell, fi)), hash(vec3(cell, fi + 7.0)));
      night += vec3(0.7, 0.75, 0.8) * smoothstep(0.16 - fi * 0.03, 0.0, length(fract(sn) - j)) * (0.5 - fi * 0.12);
    }
    c = night * 0.8;
    float F = 0.04 + 0.96 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
    c += F * envSpec(reflect(-V, n), 0.05) * 0.3;

  } else if (uMode == 20) {
    // the fire: licking flames, hottest at the base
    vec2 fu = vec2(vUv.x - 0.5, 1.0 - vUv.y);
    float fl = fbm(vec3(fu.x * 5.0, fu.y * 3.0 - uTime * 1.8, uTime * 0.4 + vWorld.x));
    float body = smoothstep(0.55, 0.0, abs(fu.x) * 1.2 + fu.y * 0.55 - 0.05);
    float shape = smoothstep(0.35, 0.75, fl + body * 0.7 - fu.y * 0.65);
    vec3 col = mix(vec3(0.9, 0.18, 0.02), vec3(2.2, 1.2, 0.4), smoothstep(0.4, 1.0, shape + (1.0 - fu.y) * 0.3));
    c = col * shape * (1.5 - fu.y);
    c += vec3(1.2, 0.35, 0.05) * smoothstep(0.25, 0.0, fu.y) * body * 0.8;
    gAlpha = 1.0;

  } else if (uMode == 21) {
    // a black stand-in, under the reflections
    c = vec3(0.0);

  } else if (uMode == 0) {
    c = shade(rosewood(vLocal, normalize(vObjN), 1.0));

  } else if (uMode == 1) {
    // ivory bakelite knob: knurled skirt, machined brass centre, engraved pointer
    vec3 ivory = srgbToLinear(vec3(0.88, 0.82, 0.68));
    if (vUv.y < 0.5) {
      float knurl = 0.5 + 0.5 * sin(vUv.x * 6.2831 * 40.0);
      vec3 t = normalize(cross(uFront, n));
      Surf s = plain(ivory * (0.85 + 0.15 * knurl), normalize(n + t * (knurl - 0.5) * 0.5), 0.32);
      s.Ng = n;
      s.coat = 0.5;
      c = shade(s);
    } else {
      float r = length(vLocal.xy);
      float pointer = step(abs(vLocal.x), 0.005) * step(0.05, vLocal.y) * step(vLocal.y, 0.09);
      Surf s;
      if (r < 0.045) {
        s = plain(vec3(0.95, 0.74, 0.42), n, 0.16 + 0.06 * sin(r * 1400.0));
        s.metal = 1.0;
      } else {
        s = plain(ivory, n, 0.28);
        s.coat = 0.6;
        s.ao = smoothstep(0.04, 0.055, r);
      }
      s.albedo = mix(s.albedo, vec3(0.05, 0.03, 0.02), pointer);
      s.metal *= 1.0 - pointer;
      c = shade(s);
    }

  } else if (uMode == 2) {
    // brass trim, brushed along its length
    float brush = noise(vec3(vUv.x * 600.0, vUv.y * 3.0, 0.0));
    Surf s = plain(vec3(0.93, 0.72, 0.4), n, 0.2 + 0.12 * brush);
    s.metal = 1.0;
    c = shade(s);

  } else if (uMode == 3) {
    // grille: rosewood dowels over gold linen; the cloth breathes with the sound
    vec2 p = vUv * uSize;
    float ribs = fract(p.x * 18.0);
    float ribW = 0.58;
    if (ribs < ribW) {
      float across = ribs / ribW * 2.0 - 1.0;
      vec3 nCab = normalize(vec3(across, 0.0, sqrt(max(0.0, 1.0 - across * across))));
      Surf s = rosewood(cabPos() + vec3(0.0, 0.0, across * 0.01), nCab, 1.0);
      s.ao = 0.55 + 0.45 * sqrt(max(0.0, 1.0 - across * across));
      c = shade(s);
    } else {
      vec2 uv = p * 2.2;
      float lum = dot(texture(uMatD, uv).rgb, vec3(0.3, 0.5, 0.2));
      vec3 gold = vec3(0.26, 0.17, 0.065) * (lum / 0.55);
      vec2 tn = texture(uMatN, uv).xy * 2.0 - 1.0;
      vec3 nCab = normalize(vec3(tn * 0.9, 1.0));
      Surf s = plain(gold, toWorld(nCab), mix(0.75, 0.95, texture(uMatR, uv).r));
      float gap = (ribs - ribW) / (1.0 - ribW);
      s.ao = 0.25 + 0.75 * smoothstep(0.0, 0.35, gap) * smoothstep(1.0, 0.65, gap);
      // the speaker behind the cloth darkens its middle
      vec2 q = (vUv - vec2(0.5, 0.55)) * vec2(uSize.x / uSize.y, 1.0);
      s.ao *= 0.7 + 0.3 * smoothstep(0.25, 0.6, length(q));
      s.albedo *= 1.0 + uLevel * 0.25 * uPower;
      c = shade(s);
    }

  } else if (uMode == 4) {
    // the back: dark hardboard with vent slots; the valves glow through
    vec2 p = vUv * uSize;
    vec2 uv = p * 1.2;
    vec3 board = texture(uMatD, uv).rgb * vec3(0.26, 0.17, 0.12);
    vec2 tn = texture(uMatN, uv).xy * 2.0 - 1.0;
    vec2 cell = vec2(fract(p.x * 7.0), fract(p.y * 3.2));
    vec2 e = vec2(min(cell.x - 0.18, 0.82 - cell.x), min(cell.y - 0.42, 0.58 - cell.y));
    float slot = step(0.0, e.x) * step(0.0, e.y);
    float glow = 0.0;
    for (int i = 0; i < 7; i++) {
      vec2 tube = vec2(0.25 + float(i) * 0.27, 0.72 + 0.12 * sin(float(i) * 2.3));
      float flick = 0.9 + 0.1 * sin(uTime * (7.0 + float(i)) + float(i));
      glow += exp(-dot(p - tube, p - tube) * 18.0) * flick;
    }
    if (slot > 0.5) {
      c = vec3(1.0, 0.36, 0.08) * glow * uPower * 3.0 + vec3(0.004);
    } else {
      Surf s = plain(board, normalize(n + (mat3(uCab) * vec3(-tn.x, tn.y, 0.0)) * 0.6), mix(0.6, 0.9, texture(uMatR, uv).r));
      // distance from this point to the nearest slot, in cabinet units
      float out_ = length(max(-e, 0.0) * vec2(1.0 / 7.0, 1.0 / 3.2));
      s.ao = 0.5 + 0.5 * smoothstep(0.0, 0.025, out_);
      s.emit = vec3(1.0, 0.36, 0.08) * glow * uPower * 0.25 * exp(-out_ * 120.0);
      c = shade(s);
    }

  } else if (uMode == 5) {
    // magic eye: green phosphor fan under a glass dome, in a brass bezel
    vec2 q = vUv - 0.5;
    float r = length(q) * 2.0;
    float ang = abs(atan(q.x, q.y));
    float open = mix(1.2, 0.05, clamp(uStrength, 0.0, 1.0)) + uHiss * 0.05 * sin(uTime * 40.0);
    float lit = step(open, ang) * smoothstep(0.86, 0.8, r) * step(0.3, r);
    vec3 phosphor = vec3(0.15, 1.0, 0.35) * (0.5 + 0.8 * (1.0 - r));
    if (r > 0.86) {
      vec3 bn = normalize(n + (mat3(uCab) * vec3(q, 0.0)) * 1.5 * smoothstep(0.86, 1.0, r));
      Surf s = plain(vec3(0.93, 0.72, 0.4), bn, 0.22);
      s.metal = 1.0;
      c = shade(s);
    } else {
      c = vec3(0.004, 0.01, 0.006) + phosphor * lit * uPower * 2.5;
      vec3 dome = normalize(n + (mat3(uCab) * vec3(q * 1.6, 0.0)));
      float F = 0.04 + 0.96 * pow(1.0 - max(dot(dome, V), 0.0), 5.0);
      c += F * envSpec(reflect(-V, dome), 0.02) + coatSpec(dome, V, normalize(vec3(-0.55, 0.75, 0.55))) * 0.1;
    }

  } else {
    // the HTML panels
    vec2 uv = vUv;
    if (uMode == 7) {
      float row = floor(uv.y * 48.0);
      float burst = step(0.82, hash1(floor(uTime * 9.0)));
      uv.x += (hash1(row + floor(uTime * 30.0)) - 0.5) * uHiss * uPower * (0.004 + burst * 0.03);
    }
    vec4 t = texture(uTex, uv);
    vec3 print = srgbToLinear(t.rgb);

    if (uMode == 7) {
      // printed glass, lit from behind by two bulbs, under a glass sheet
      float flicker = 0.95 + 0.05 * sin(uTime * 13.0) * sin(uTime * 7.3);
      float back = uPower * flicker * (0.85 + uLevel * 0.5);
      float spread = 0.45 + 0.55 * (exp(-pow((uv.x - 0.22) * 3.0, 2.0)) + exp(-pow((uv.x - 0.78) * 3.0, 2.0)));
      Surf s = plain(print * mix(0.8, 0.3, uPower), n, 0.4);
      vec2 edge = min(uv, 1.0 - uv) * vec2(uSize.x / uSize.y, 1.0);
      s.ao = smoothstep(0.0, 0.06, min(edge.x, edge.y)) * 0.7 + 0.3;
      s.emit = print * print * vec3(1.0, 0.48, 0.14) * back * spread * 1.1 * s.ao;
      c = shade(s);
      float px = abs(uv.x - uNeedle) * 720.0;
      float needle = smoothstep(2.0, 0.6, px) * step(0.06, uv.y) * step(uv.y, 0.94);
      c = mix(c, vec3(0.5, 0.02, 0.01) + vec3(1.6, 0.25, 0.08) * uPower, needle);
      c += vec3(1.0, 0.25, 0.08) * exp(-px * 0.2) * 0.12 * uPower;
      float F = 0.04 + 0.96 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
      c += F * envSpec(reflect(-V, n), 0.02) * 0.6;
      c += coatSpec(n, V, normalize(vec3(-0.55, 0.75, 0.55))) * vec3(2.6, 2.4, 2.15) * 0.05;
    } else if (uMode == 6) {
      // printing and parts on the cabinet's own rosewood
      vec3 nCab = (uCabInv * vec4(n, 0.0)).xyz;
      Surf w = rosewood(cabPos(), normalize(nCab), 1.0);
      w.albedo = mix(w.albedo, print, t.a);
      w.N = normalize(mix(w.N, n, t.a));
      w.rough = mix(w.rough, 0.45, t.a);
      w.coat = 1.0 - t.a * 0.6;
      c = shade(w);
    } else {
      // the paper label
      vec2 fib = texture(uMatN, vUv * uSize * 4.0).xy * 2.0 - 1.0;
      Surf s = plain(print, normalize(n + (mat3(uCab) * vec3(-fib.x, fib.y, 0.0)) * 0.12), 0.85);
      vec2 edge = min(vUv, 1.0 - vUv) * vec2(uSize.x / uSize.y, 1.0);
      s.ao = 0.75 + 0.25 * smoothstep(0.0, 0.04, min(edge.x, edge.y));
      c = shade(s);
      gAlpha = t.a; // a card can have a shape (the teapot's tag does)
    }
  }

  // the room pass renders linear light into its own texture, to be blurred
  if (uLinearOut == 1) {
    outColor = vec4(c, gAlpha);
    return;
  }
  // a reflection in the tabletop fades the further it is below the surface
  if (uReflect == 1) c *= exp(-max(uReflectY - vWorld.y, 0.0) * 1.4) * 0.8;
  // exposure, ACES-ish curve, sRGB out
  c *= uExposure;
  c = clamp((c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14), 0.0, 1.0);
  outColor = vec4(pow(c, vec3(1.0 / 2.2)), gAlpha);
}
