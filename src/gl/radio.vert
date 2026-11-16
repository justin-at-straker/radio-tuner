#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aUv;
uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProj;
uniform int uScreen; // 1: draw the unit quad over the whole screen, at the back (the room)
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
  vec4 w = uModel * vec4(aPos, 1.0);
  vWorld = w.xyz;
  vNormal = normalize(mat3(uModel) * aNormal);
  vObjN = aNormal;
  vUv = aUv;
  vLocal = aPos;
  gl_Position = uProj * uView * w;
}
