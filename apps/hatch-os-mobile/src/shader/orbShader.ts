/**
 * Presence v4 sphere, ported from the spec appendix.
 * `uTime` is the integrated swirl phase (`phase += dt * speed`) and `uSpeed`
 * is passed as 1 so the shader's `t * uSpeed` terms do not apply speed twice
 * or snap when the state changes. `uClock` is unscaled time for breath and the
 * approval ring, which the spec keeps independent of swirl speed.
 */
export const ORB_SKSL = `
uniform float2 uRes;
uniform float  uTime;
uniform float  uClock;
uniform float  uRadius;
uniform float3 uCore;
uniform float3 uHi;
uniform float3 uMid;
uniform float3 uDeep;
uniform float3 uEdge;
uniform float  uSpeed;
uniform float  uSwirl;
uniform float  uBloom;
uniform float  uBreathAmp;
uniform float  uBreathFreq;
uniform float  uRingPulse;
uniform float  uAudio;
uniform float  uCoreFocus;
uniform float  uCorePower;
uniform float  uFilamentGain;
uniform float  uReduced;

float hash(float2 p) {
  p = fract(p * float2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(float2 p) {
  float2 i = floor(p);
  float2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + float2(1.0, 0.0));
  float c = hash(i + float2(0.0, 1.0));
  float d = hash(i + float2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(float2 p) {
  float v = 0.0;
  float a = 0.5;
  float2x2 rot = float2x2(0.80, -0.60, 0.60, 0.80);
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = rot * p * 2.05 + float2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

float dither(float2 coord) {
  float n1 = hash(coord);
  float n2 = hash(coord + 17.3);
  return (n1 + n2 - 1.0) / 255.0;
}

half4 main(float2 fragCoord) {
  float2 uv = fragCoord / uRes;
  float2 p = float2(uv.x - 0.5, 0.5 - uv.y);
  float d = length(p);

  float t = uReduced > 0.5 ? 2.4 : uTime;
  float clock = uReduced > 0.5 ? 2.4 : uClock;
  float breath = uReduced > 0.5 ? 0.0 : sin(clock * uBreathFreq) * uBreathAmp;
  float r = uRadius * (1.0 + breath + uAudio * 0.032);

  float distOut = max(d - r, 0.0) / max(0.5 - r, 0.001);
  float bloom1 = exp(-distOut * 10.5) * 0.34 * uBloom;
  float bloom2 = exp(-distOut * 4.8) * 0.11 * uBloom;
  float outerFade = smoothstep(0.49, r * 0.90, d);

  float ringRadius = r * (1.13 + 0.025 * sin(clock * uBreathFreq));
  float ringD = abs(d - ringRadius);
  float ringAlpha = exp(-ringD * 260.0) * uRingPulse * (0.42 + 0.28 * sin(clock * uBreathFreq));
  if (uReduced > 0.5 && uRingPulse > 0.25) {
    ringAlpha = smoothstep(0.008, 0.0, abs(d - r * 1.14)) * 0.42;
  } else if (uReduced > 0.5) {
    ringAlpha = 0.0;
  }

  float3 bloomCol = mix(uDeep, uMid, 0.55) * bloom2 + mix(uMid, uHi, 0.25) * bloom1;
  bloomCol += uHi * ringAlpha;
  float outAlpha = clamp((bloom1 + bloom2) * outerFade + ringAlpha, 0.0, 1.0);

  float sphereMask = 1.0 - smoothstep(r - 0.004, r + 0.004, d);
  if (sphereMask > 0.001) {
    float2 np = p / r;
    float nd = length(np);
    float z = sqrt(max(1.0 - nd * nd, 0.0));
    float3 normal = normalize(float3(np, z));

    float2 sp = np * (1.30 - 0.38 * z);
    float ang = atan(sp.y, sp.x) + (1.0 - nd) * 1.0 + t * 0.38 * uSpeed;
    float rad = length(sp);
    float2 q = float2(cos(ang), sin(ang)) * rad * uSwirl;

    float f1 = fbm(q * 2.3 + float2(t * 0.26 * uSpeed, -t * 0.20 * uSpeed));
    float f2 = fbm(q * 3.4 + float2(f1 * 2.2 - t * 0.34 * uSpeed, f1 * 1.7));
    float f3 = fbm(q * 4.8 - float2(f2 * 1.9, t * 0.46 * uSpeed));

    float ridge1 = pow(clamp(1.0 - abs(f2 * 2.0 - 1.0), 0.0, 1.0), 4.8);
    float ridge2 = pow(clamp(1.0 - abs(f3 * 2.0 - 1.0), 0.0, 1.0), 6.0);

    float coreTight = exp(-nd * nd * uCoreFocus);
    float midBody = exp(-nd * nd * 2.6);

    float3 col = mix(uEdge, uDeep, smoothstep(0.95, 0.30, nd) * (0.35 + 0.65 * f1));
    col = mix(col, uMid, clamp(midBody * 0.28 + f1 * 0.24 * midBody, 0.0, 0.68));
    col += uMid * ridge1 * 0.58 * uFilamentGain;
    col += uHi * (ridge1 * 0.40 + ridge2 * 0.68) * (0.35 + 0.50 * midBody) * uFilamentGain;
    col += uCore * (coreTight * uCorePower + ridge1 * ridge2 * 0.45 * uFilamentGain);

    float fresnel = pow(1.0 - z, 3.6);
    col += mix(uMid, uHi, 0.5) * fresnel * 0.48;

    float2 lightDir = normalize(float2(-0.56, 0.64));
    float specDot = max(dot(normalize(normal.xy), lightDir), 0.0);
    float specArc = smoothstep(0.60, 0.94, nd) * smoothstep(1.0, 0.88, nd) * pow(specDot, 5.5);
    col += float3(0.95, 0.97, 1.00) * specArc * 0.34;

    col *= mix(1.0, 0.62, smoothstep(0.84, 0.99, nd) * (1.0 - fresnel * 0.85));

    col = mix(bloomCol, col, sphereMask);
    float alpha = max(outAlpha, sphereMask);
    col += dither(fragCoord);
    col = clamp(col, 0.0, 1.0);
    return half4(half3(col * alpha), half(alpha));
  }

  float3 finalBloom = clamp(bloomCol + dither(fragCoord), 0.0, 1.0);
  return half4(half3(finalBloom * outAlpha), half(outAlpha));
}
`;
