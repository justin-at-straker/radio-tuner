#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aUv;
uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProj;
uniform int uScreen; // 1: draw the unit quad over the whole screen, at the back (the room)
// a newspaper page turning: rolled about its spine (its left edge) by uFlip,
// bowing (uCurl) as it goes; uPageZ is the page width, so the roll keeps scale
uniform int uPage;
uniform float uFlip;
uniform float uCurl;
uniform float uPageZ;
uniform float uBow;
uniform float uLeafZ; // how a sheet sits in the stack: behind, or turned over on top // a soft bow across the page: its middle sits back, its edges come forward
out vec3 vWorld;
out vec3 vNormal;
out vec3 vObjN;
out vec2 vUv;
out vec3 vLocal;
void main() {
  if (uScreen == 1) {
    vec2 ndc = aPos.xy * 2.0;
    vUv = ndc;
    vWorld = vec3(0.0);
    vNormal = vec3(0.0, 0.0, 1.0);
    vObjN = vNormal;
    vLocal = aPos;
    gl_Position = vec4(ndc, 0.99999, 1.0);
    return;
  }
  vec3 pos = aPos;
  vec3 nrm = aNormal;
  if (uPage == 1) {
    float s = aPos.x + 0.5; // distance from the spine, in page widths
    float c = uCurl * sin(uFlip);
    float a = uFlip + c * s;
    if (abs(c) < 1e-3) {
      pos.x = -0.5 + s * cos(uFlip);
      pos.z = s * sin(uFlip) * uPageZ;
    } else {
      pos.x = -0.5 + (sin(uFlip + c * s) - sin(uFlip)) / c;
      pos.z = (cos(uFlip) - cos(uFlip + c * s)) / c * uPageZ;
    }
    pos.z += 0.004 * sin(uFlip * 0.5); // a turning page rides just above the one below
    pos.z += uBow * (s - 0.5) * (s - 0.5) * uPageZ;
    pos.z += uLeafZ;
    nrm = vec3(-sin(a), 0.0, cos(a));
  }
  vec4 w = uModel * vec4(pos, 1.0);
  vWorld = w.xyz;
  vNormal = normalize(mat3(uModel) * nrm);
  vObjN = aNormal;
  vUv = aUv;
  vLocal = pos;
  gl_Position = uProj * uView * w;
}
