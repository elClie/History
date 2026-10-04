/* Shared GLSL for the eroded glowing edge (roster-fx.js, ero-photo.js). Host shader must declare `uniform float uTime;` first. */
window.HisEroGLSL = `
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p, int oct) {
  float v = 0.0, a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) {
    if (i >= oct) break;
    v += a * noise(p); p = m * p; a *= 0.5;
  }
  return v;
}

// x = crunchy field, y = smooth field; > 0 = kept. Noise only runs inside the band where it can matter.
vec2 edge(vec2 s, vec2 l, vec2 hs, float E, float seed, float reach) {
  float d = min(hs.x - abs(l.x), hs.y - abs(l.y));
  if (d > E * 1.4 + 4.0) return vec2(d);
  if (d < -reach) return vec2(d);
  float t = uTime;
  vec2 q = l + seed * 97.0;
  float n1 = fbm(q * 0.028 + vec2(0.0, t * 0.05), 4);
  float n2 = fbm(q * 0.1 + n1 * 2.5 - vec2(t * 0.03, 0.0), 4);
  float n3 = fbm(q * 0.38 + n2 * 3.0, 3);
  float ero = E * clamp(0.05 + 1.3 * (n1 - 0.3) + 0.6 * (n2 - 0.5), 0.0, 1.15) + (n3 - 0.5) * E * 0.35;
  float crumb = (noise(s * 0.35 + n2 * 6.0) - 0.5) * 3.0;
  float soft = d - ero;
  return vec2(soft - crumb, soft);
}

// halo = outward spill; lip = inward glow that keeps each side of a seam in its own colour
float glowAmt(float soft, float k, float halo, float lip) {
  float h = exp(min(soft, 0.0) / k) * step(soft, 0.0);
  float core = exp(-abs(soft) / 2.5);
  float l = exp(-max(soft, 0.0) / 9.0) * step(0.0, soft);
  return h * halo + core * 0.9 + l * lip;
}

float flicker(vec2 l, float seed) {
  float t = uTime;
  return 0.7 + 0.6 * noise(vec2((l.x + l.y) * 0.05 + seed * 13.0, t * 1.6))
                     * noise(vec2((l.x - l.y) * 0.02 - t * 0.4, 5.0 + seed));
}

float rimMask(vec2 s, float field, float w) {
  float band = step(0.0, field) * (1.0 - smoothstep(0.0, w, field));
  float fleck = step(0.5, noise(s * 0.6 + uTime * 0.8));
  float lip = step(0.0, field) * (1.0 - smoothstep(0.0, 1.2, field));
  return max(band * fleck, lip * 0.85);
}

// 0 at the canvas border → 1 at bleed px in. Multiply every glow by it: anything still lit at the border shows as a hard rectangle.
float bleedFade(vec2 s, vec2 res, float bleed) {
  vec2 m = clamp(min(s, res - s) / bleed, 0.0, 1.0);
  m = m * m * (3.0 - 2.0 * m);
  return m.x * m.y;
}

// Shockwave (p = 0..1): jagged ring racing outward + wave running inward from the edge
float shock(vec2 s, vec2 l, float soft, float p, float inward, float seed) {
  float jit = (noise(l * 0.045 + seed * 9.0) - 0.5) * 28.0 + (noise(s * 0.3) - 0.5) * 4.0;
  float fade = (1.0 - p) * (1.0 - p);
  float outD = -soft - p * 240.0 - jit;
  float ring = exp(-outD * outD / (40.0 + 300.0 * p)) * step(0.0, -soft);
  float inD = soft - p * inward - jit * 0.6;
  float wave = exp(-inD * inD / 90.0) * step(0.0, soft);
  return (ring * 1.6 + wave * 0.9) * fade;
}
`;
