import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

// ============================================
// ASSETS
// ============================================

const IMAGES = [
  '1.JPG',
  '2.jpg',
  '3.jpg',
  '4.jpg',
  '5.jpg',
  '6.JPG',
  '7.JPG',
  '8.JPG',
  '9.jpg',
  '10.jpg',
  '11.jpg',
  '12.jpg',
  '13.jpg',
  '14.jpg',
  '15.jpg',
  '16.jpg',
];

const TITLE_FONT_FAMILY = 'ANACycleTitle';

const TITLE = {
  text: 'ANACYCLE',
  enabled: true,
  sizePercent: 15,
  fillColor: '#ffffff',
  strokeColor: '#000000',
  strokeWidth: 2,
  shadowEnabled: false,
  shadowColor: '#000000',
  shadowBlur: 12,
  shadowOffsetX: 0,
  shadowOffsetY: 0,
};

// ============================================
// REACTION-DIFFUSION PARAMS (from reaction-diffusion-react)
// ============================================

const PRESETS = [
  { name: 'Default', f: 0.054, k: 0.062 },
  { name: 'Negative bubbles', f: 0.098, k: 0.0555 },
  { name: 'Positive bubbles', f: 0.098, k: 0.057 },
  { name: 'Precritical bubbles', f: 0.082, k: 0.059 },
  { name: 'Worms and loops', f: 0.082, k: 0.06 },
  { name: 'Stable solitons', f: 0.074, k: 0.064 },
  { name: 'The U-Skate World', f: 0.062, k: 0.0609 },
  { name: 'Worms', f: 0.058, k: 0.065 },
  { name: 'Worms join into maze', f: 0.046, k: 0.063 },
  { name: 'Negatons', f: 0.046, k: 0.0594 },
  { name: 'Turing patterns', f: 0.042, k: 0.059 },
  { name: 'Chaos', f: 0.026, k: 0.051 },
  { name: 'Waves', f: 0.014, k: 0.045 },
];

const RD = {
  f: 0.054,
  k: 0.062,
  dA: 0.2097,
  dB: 0.105,
  timestep: 1.0,
  brushRadius: 100.0,
  stepsPerFrame: 60,
  renderingStyle: 7,
  warmStartIterations: 240,
  simScale: 1.0,
  // Give it a gentle built-in "flow" so it keeps moving.
  biasX: 0.006,
  biasY: -0.004,
  sourceStrength: 0.005,
};

const COLORS = {
  // Gradient (style 1)
  color1: '#000000', stop1: 0.0,
  color2: '#000000', stop2: 0.2,
  color3: '#ffffff', stop3: 0.4,
  color4: '#000000', stop4: 0.6,
  color5: '#000000', stop5: 0.8,

  // HSL mapping (style 0)
  hslFromMin: 0.0,
  hslFromMax: 1.0,
  hslToMin: 0.0,
  hslToMax: 1.0,
  hslSaturation: 1.0,
  hslLuminosity: 0.5,
};

// ============================================
// SHADERS (ported from reaction-diffusion-react)
// ============================================

const simulationVert = `
uniform vec2 resolution;

varying vec2 v_uvs[9];
varying vec2 texelStep;

void main() {
  texelStep = 1.0 / resolution.xy;

  v_uvs[0] = uv;
  v_uvs[1] = uv + vec2(0.0, -texelStep.y);
  v_uvs[2] = uv + vec2(texelStep.x, 0.0);
  v_uvs[3] = uv + vec2(0.0, texelStep.y);
  v_uvs[4] = uv + vec2(-texelStep.x, 0.0);

  v_uvs[5] = uv + vec2(texelStep.x, -texelStep.y);
  v_uvs[6] = uv + vec2(texelStep.x, texelStep.y);
  v_uvs[7] = uv + vec2(-texelStep.x, texelStep.y);
  v_uvs[8] = uv + vec2(-texelStep.x, -texelStep.y);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const simulationFrag = `
uniform sampler2D previousIterationTexture;
uniform sampler2D sourceTexture;
uniform float sourceStrength;

uniform float f;
uniform float k;
uniform float dA;
uniform float dB;
uniform float timestep;

uniform vec2 mousePosition;
uniform float brushRadius;

uniform vec2 bias;
uniform vec2 resolution;

varying vec2 v_uvs[9];

vec3 weights[3];

void setWeights(int type) {
  if(type == 2) {
    weights[0] = vec3(0.0,  1.0,  0.0);
    weights[1] = vec3(1.0, -4.0,  1.0);
    weights[2] = vec3(0.0,  1.0,  0.0);
  }
}

vec2 getLaplacian(vec4 centerTexel) {
  setWeights(2);

  vec2 laplacian = centerTexel.xy * weights[1][1];
  laplacian += texture2D(previousIterationTexture, fract(v_uvs[1])).xy * (weights[0][1] + bias.y);
  laplacian += texture2D(previousIterationTexture, fract(v_uvs[2])).xy * (weights[1][2] + bias.x);
  laplacian += texture2D(previousIterationTexture, fract(v_uvs[3])).xy * (weights[2][1] - bias.y);
  laplacian += texture2D(previousIterationTexture, fract(v_uvs[4])).xy * (weights[1][0] - bias.x);

  laplacian += texture2D(previousIterationTexture, fract(v_uvs[5])).xy * weights[0][2];
  laplacian += texture2D(previousIterationTexture, fract(v_uvs[6])).xy * weights[2][2];
  laplacian += texture2D(previousIterationTexture, fract(v_uvs[7])).xy * weights[2][0];
  laplacian += texture2D(previousIterationTexture, fract(v_uvs[8])).xy * weights[0][0];

  return laplacian;
}

void main() {
  vec4 centerTexel = texture2D(previousIterationTexture, v_uvs[0]);
  float A = centerTexel[0];
  float B = centerTexel[1];

  // Continuously drive the simulation from the source (background + title).
  // This makes the RD *apply to* the content instead of looking like a separate overlay layer.
  vec3 src = texture2D(sourceTexture, v_uvs[0]).rgb;
  float srcLum = dot(src, vec3(0.299, 0.587, 0.114));
  float targetB = clamp(1.0 - srcLum, 0.0, 1.0);
  B = mix(B, targetB, sourceStrength);

  if(mousePosition.x > 0.0 && mousePosition.y > 0.0) {
    float distToMouse = distance(mousePosition * resolution, v_uvs[0] * resolution);
    if(distToMouse < brushRadius) {
      gl_FragColor = vec4(mix(0.0, 0.3, distToMouse/brushRadius), 0.5, 0.0, 1.0);
      return;
    }
  }

  vec2 laplacian = getLaplacian(centerTexel);
  float reactionTerm = A * B * B;

  gl_FragColor = vec4(
    A + ((dA * laplacian[0] - reactionTerm + f * (1.0 - A)) * timestep),
    B + ((dB * laplacian[1] + reactionTerm - (k + f) * B) * timestep),
    0.0,
    1.0
  );
}
`;

const displayVert = `
varying vec2 v_uv;

void main() {
  v_uv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const displayFrag = `
varying vec2 v_uv;
uniform sampler2D textureToDisplay;
uniform sampler2D previousIterationTexture;
uniform float time;

uniform int renderingStyle;

uniform vec4 colorStop1;
uniform vec4 colorStop2;
uniform vec4 colorStop3;
uniform vec4 colorStop4;
uniform vec4 colorStop5;

uniform vec2 hslFrom;
uniform vec2 hslTo;
uniform float hslSaturation;
uniform float hslLuminosity;

float when_gt(float x, float y)  { return max(sign(x - y), 0.0); }

float map(float value, float min1, float max1, float min2, float max2) {
  return min2 + (value - min1) * (max2 - min2) / (max1 - min1);
}

vec3 hsb2rgb(in vec3 c){
  vec3 rgb = clamp(abs(mod(c.x*6.0+vec3(0.0,4.0,2.0),
    6.0)-3.0)-1.0,
    0.0,
    1.0 );
  rgb = rgb*rgb*(3.0-2.0*rgb);
  return c.z * mix(vec3(1.0), rgb, c.y);
}

vec4 rainbow(vec2 uv) {
  float PI = 3.1415926535897932384626433832795;
  float center = 0.1;
  float width = 1.0;
  float frequency = 1.5;
  float r1 = sin(frequency*uv.x + 0.0) * width + center;
  float g1 = sin(frequency*uv.x + 2.0*PI/3.0) * width + center;
  float b1 = sin(frequency*uv.x + 4.0*PI/3.0) * width + center;

  float r2 = sin(frequency*uv.y + 0.0) * width + center;
  float g2 = sin(frequency*uv.y + 2.0*PI/3.0) * width + center;
  float b2 = sin(frequency*uv.y + 4.0*PI/3.0) * width + center;

  return vec4(vec3(r1, g1, b1) * vec3(r2, g2, b2), 1.0);
}

void main() {
  vec4 previousPixel = texture2D(previousIterationTexture, v_uv);
  vec4 pixel = texture2D(textureToDisplay, v_uv);
  float A = pixel[0];
  float B = pixel[1];
  vec4 outputColor;

  if(renderingStyle == 0) {
    outputColor = vec4(hsb2rgb(vec3(
      map(B-A, hslFrom[0], hslFrom[1], hslTo[0], hslTo[1]),
      hslSaturation,
      hslLuminosity
    )), 1.);

  } else if(renderingStyle == 1) {
    vec3 color;

    if(B <= colorStop1.a) {
      color = colorStop1.rgb;
    } else if(B <= colorStop2.a) {
      color = mix(colorStop1.rgb, colorStop2.rgb, (B - colorStop1.a) / (colorStop2.a - colorStop1.a));
    } else if(B <= colorStop3.a) {
      color = mix(colorStop2.rgb, colorStop3.rgb, (B - colorStop2.a) / (colorStop3.a - colorStop2.a));
    } else if(B <= colorStop4.a) {
      color = mix(colorStop3.rgb, colorStop4.rgb, (B - colorStop3.a) / (colorStop4.a - colorStop3.a));
    } else if(B <= colorStop5.a) {
      color = mix(colorStop4.rgb, colorStop5.rgb, (B - colorStop4.a) / (colorStop5.a - colorStop4.a));
    } else {
      color = colorStop5.rgb;
    }

    outputColor = vec4(color.rgb, 1.0);

  } else if(renderingStyle == 2) {
    outputColor = vec4(
      1000.0 * abs(pixel.x - previousPixel.x) + 1.0 * pixel.x - 0.5 * previousPixel.y,
      0.9 * pixel.x - 2.0 * pixel.y,
      10000.0 * abs(pixel.y - previousPixel.y),
      1.0
    );

  } else if(renderingStyle == 3) {
    outputColor = vec4(
      10000.0 * abs(pixel.y - previousPixel.y),
      1000.0 * abs(pixel.x - previousPixel.x) + 1.0 * pixel.x - 0.5 * previousPixel.y,
      0.9 * pixel.x - 2.0 * pixel.y,
      1.0
    );

  } else if(renderingStyle == 4) {
    outputColor = vec4(
      1000.0 * abs(pixel.x - previousPixel.x) + 1.0 * pixel.x - 50000.0 * previousPixel.y,
      10000.0 * abs(pixel.y - previousPixel.y),
      0.6 * pixel.x - .1 * pixel.y,
      1.0
    );

  } else if(renderingStyle == 5) {
    float c = A - B;
    outputColor = vec4(c, c, c, 1.0);
    vec4 rbow = rainbow(v_uv.xy + time*.5);
    float gBranch = when_gt(B, 0.01);
    outputColor = mix(outputColor, outputColor - rbow, gBranch);

  } else if(renderingStyle == 6) {
    float grayValue = pixel.r - pixel.g;
    outputColor = vec4(grayValue, grayValue, grayValue, 1.0);

  } else if(renderingStyle == 7) {
    float grayValue = pixel.r - pixel.g;
    if(grayValue > .3) {
      outputColor = vec4(1.0, 1.0, 1.0, 1.0);
    } else {
      outputColor = vec4(0.0, 0.0, 0.0, 1.0);
    }

    // RD-05 request: swap black/white for the Sharp mode.
    outputColor.rgb = vec3(1.0) - outputColor.rgb;

  } else if(renderingStyle == 8) {
    outputColor = pixel;
  }

  // Render ONLY the RD output (no underlying base image layer).
  gl_FragColor = vec4(outputColor.rgb, 1.0);
}
`;

const passthroughVert = `
varying vec2 v_uv;

void main() {
  v_uv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const passthroughFrag = `
varying vec2 v_uv;
uniform sampler2D textureToDisplay;

void main() {
  gl_FragColor = texture2D(textureToDisplay, v_uv);
}
`;

// ============================================
// STATE
// ============================================

let currentImageIndex = 0;
let images = [];

let renderer;
let scene;
let camera;
let mesh;
let renderTargets = [];
let currentRT = 0;
let renderTargetType = THREE.UnsignedByteType;

let seedCanvas;
let seedCtx;

let simWidth = 0;
let simHeight = 0;

let titleMaskCanvas;
let titleMaskCtx;

const uniforms = {
  simulation: {
    previousIterationTexture: { value: null },
    sourceTexture: { value: null },
    sourceStrength: { value: RD.sourceStrength },
    resolution: { value: new THREE.Vector2(900, 900) },
    mousePosition: { value: new THREE.Vector2(-1, -1) },
    brushRadius: { value: RD.brushRadius },
    f: { value: RD.f },
    k: { value: RD.k },
    dA: { value: RD.dA },
    dB: { value: RD.dB },
    timestep: { value: RD.timestep },
    bias: { value: new THREE.Vector2(RD.biasX, RD.biasY) },
  },
  display: {
    textureToDisplay: { value: null },
    previousIterationTexture: { value: null },
    time: { value: 0 },
    renderingStyle: { value: RD.renderingStyle },
    colorStop1: { value: new THREE.Vector4(0, 0, 0, COLORS.stop1) },
    colorStop2: { value: new THREE.Vector4(0, 0, 0, COLORS.stop2) },
    colorStop3: { value: new THREE.Vector4(1, 1, 1, COLORS.stop3) },
    colorStop4: { value: new THREE.Vector4(0, 0, 0, COLORS.stop4) },
    colorStop5: { value: new THREE.Vector4(0, 0, 0, COLORS.stop5) },
    hslFrom: { value: new THREE.Vector2(COLORS.hslFromMin, COLORS.hslFromMax) },
    hslTo: { value: new THREE.Vector2(COLORS.hslToMin, COLORS.hslToMax) },
    hslSaturation: { value: COLORS.hslSaturation },
    hslLuminosity: { value: COLORS.hslLuminosity },
  },
  passthrough: {
    textureToDisplay: { value: null },
  },
};

const materials = {
  simulation: null,
  display: null,
  passthrough: null,
};

function updateImageName(index) {
  const label = document.getElementById('imageName');
  if (!label) return;
  label.textContent = images[index]?.filename ?? '';
}

function setBodyBackground(filename) {
  // RD-04 renders the background inside the canvas now.
  // Kept as a no-op to avoid touching unrelated image-rolling logic.
  void filename;
}

function ensureTitleFontLoaded() {
  if (!document.fonts || !document.fonts.load) return Promise.resolve();
  const px = Math.max(16, Math.floor((Math.min(window.innerWidth, window.innerHeight) * TITLE.sizePercent) / 100));
  return document.fonts.load(`${px}px ${TITLE_FONT_FAMILY}`, TITLE.text).catch(() => undefined);
}

function drawTitleOverlay(ctx, width, height) {
  if (!TITLE.enabled) return;

  const fontPx = (Math.min(width, height) * TITLE.sizePercent) / 100;
  const centerX = width / 2;
  const centerY = height / 2;

  ctx.save();
  ctx.font = `${Math.round(fontPx)}px ${TITLE_FONT_FAMILY}, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (TITLE.shadowEnabled) {
    ctx.shadowColor = TITLE.shadowColor;
    ctx.shadowBlur = TITLE.shadowBlur;
    ctx.shadowOffsetX = TITLE.shadowOffsetX;
    ctx.shadowOffsetY = TITLE.shadowOffsetY;
  } else {
    ctx.shadowColor = 'rgba(0,0,0,0)';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }

  ctx.fillStyle = TITLE.fillColor;
  ctx.fillText(TITLE.text, centerX, centerY);

  if (TITLE.strokeWidth > 0) {
    ctx.strokeStyle = TITLE.strokeColor;
    ctx.lineWidth = TITLE.strokeWidth;
    ctx.strokeText(TITLE.text, centerX, centerY);
  }

  ctx.restore();
}

function drawCoverImageToSeed(imageEl, width, height) {
  seedCtx.clearRect(0, 0, width, height);

  const imgW = imageEl.naturalWidth || imageEl.width;
  const imgH = imageEl.naturalHeight || imageEl.height;
  if (!imgW || !imgH) return;

  const scale = Math.max(width / imgW, height / imgH);
  const drawW = imgW * scale;
  const drawH = imgH * scale;
  const dx = (width - drawW) / 2;
  const dy = (height - drawH) / 2;

  seedCtx.save();
  // RD-05: keep the background source normal; we'll invert only the B/W display output.
  seedCtx.filter = 'grayscale(1)';
  seedCtx.drawImage(imageEl, dx, dy, drawW, drawH);
  seedCtx.restore();
}

function ensureTitleMaskCanvas(width, height) {
  if (!titleMaskCanvas) {
    titleMaskCanvas = document.createElement('canvas');
    titleMaskCtx = titleMaskCanvas.getContext('2d', { willReadFrequently: true });
  }
  titleMaskCanvas.width = width;
  titleMaskCanvas.height = height;
  titleMaskCtx.clearRect(0, 0, width, height);
}

function getTitleMaskPixels(width, height) {
  if (!TITLE.enabled) return null;
  ensureTitleMaskCanvas(width, height);

  const ctx = titleMaskCtx;
  const fontPx = (Math.min(width, height) * TITLE.sizePercent) / 100;
  const centerX = width / 2;
  const centerY = height / 2;

  ctx.save();
  ctx.font = `${Math.round(fontPx)}px ${TITLE_FONT_FAMILY}, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Always seed with "ink" regardless of visible title fill color.
  ctx.fillStyle = '#000000';
  ctx.fillText(TITLE.text, centerX, centerY);

  if (TITLE.strokeWidth > 0) {
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = TITLE.strokeWidth;
    ctx.strokeText(TITLE.text, centerX, centerY);
  }

  ctx.restore();
  return titleMaskCtx.getImageData(0, 0, width, height).data;
}

function seedCanvasToDataTexture(width, height, titleMaskPixels) {
  const pixels = seedCtx.getImageData(0, 0, width, height).data;
  const data = new Uint8Array(pixels.length);

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];

    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    let bChem = Math.max(0, Math.min(255, Math.round((1 - lum) * 255)));

    if (titleMaskPixels) {
      const mr = titleMaskPixels[i];
      const mg = titleMaskPixels[i + 1];
      const mb = titleMaskPixels[i + 2];
      const mLum = (0.299 * mr + 0.587 * mg + 0.114 * mb) / 255;
      const maskB = Math.max(0, Math.min(255, Math.round((1 - mLum) * 255)));
      bChem = Math.max(bChem, maskB);
    }

    data[i] = 255;
    data[i + 1] = bChem;
    data[i + 2] = 0;
    data[i + 3] = 255;
  }

  const tex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.needsUpdate = true;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

function warmStartSimulation(iterations) {
  if (!renderer || !materials.simulation || renderTargets.length < 2) return;
  const iters = Math.max(0, Math.floor(iterations || 0));
  if (iters === 0) return;

  mesh.material = materials.simulation;
  for (let i = 0; i < iters; i++) {
    const nextIndex = (currentRT + 1) % 2;
    uniforms.simulation.previousIterationTexture.value = renderTargets[currentRT].texture;

    renderer.setRenderTarget(renderTargets[nextIndex]);
    renderer.render(scene, camera);
    currentRT = nextIndex;
  }
  renderer.setRenderTarget(null);
}

function seedSimulationFromCurrentImage() {
  if (!images.length || !renderer || renderTargets.length < 2) return;

  const width = simWidth || window.innerWidth;
  const height = simHeight || window.innerHeight;

  uniforms.simulation.resolution.value.set(width, height);

  if (!seedCanvas) {
    seedCanvas = document.createElement('canvas');
    seedCtx = seedCanvas.getContext('2d', { willReadFrequently: true });
  }
  seedCanvas.width = width;
  seedCanvas.height = height;

  const img = images[currentImageIndex].img;
  drawCoverImageToSeed(img, width, height);
  drawTitleOverlay(seedCtx, width, height);

  // Feed the current background+title into the simulation as a continuously sampled source texture.
  if (!uniforms.simulation.sourceTexture.value) {
    const srcTex = new THREE.CanvasTexture(seedCanvas);
    srcTex.minFilter = THREE.LinearFilter;
    srcTex.magFilter = THREE.LinearFilter;
    srcTex.wrapS = THREE.ClampToEdgeWrapping;
    srcTex.wrapT = THREE.ClampToEdgeWrapping;
    uniforms.simulation.sourceTexture.value = srcTex;
  } else {
    uniforms.simulation.sourceTexture.value.needsUpdate = true;
  }

  const titleMaskPixels = getTitleMaskPixels(width, height);
  const seedTexture = seedCanvasToDataTexture(width, height, titleMaskPixels);

  mesh.material = materials.passthrough;
  uniforms.passthrough.textureToDisplay.value = seedTexture;

  renderer.setRenderTarget(renderTargets[0]);
  renderer.render(scene, camera);
  renderer.setRenderTarget(renderTargets[1]);
  renderer.render(scene, camera);

  renderer.setRenderTarget(null);
  currentRT = 0;

  warmStartSimulation(RD.warmStartIterations);
}

function setupThree(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, preserveDrawingBuffer: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setClearColor(0x000000, 0);

  const isWebGL2 = !!renderer.capabilities?.isWebGL2;
  if (isWebGL2) {
    const hasFloatRT = renderer.extensions?.has?.('EXT_color_buffer_float');
    renderTargetType = hasFloatRT ? THREE.HalfFloatType : THREE.UnsignedByteType;
  }

  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  materials.simulation = new THREE.ShaderMaterial({
    uniforms: uniforms.simulation,
    vertexShader: simulationVert,
    fragmentShader: simulationFrag,
    blending: THREE.NoBlending,
  });

  materials.display = new THREE.ShaderMaterial({
    uniforms: uniforms.display,
    vertexShader: displayVert,
    fragmentShader: displayFrag,
    transparent: true,
    blending: THREE.NormalBlending,
  });

  materials.passthrough = new THREE.ShaderMaterial({
    uniforms: uniforms.passthrough,
    vertexShader: passthroughVert,
    fragmentShader: passthroughFrag,
    blending: THREE.NoBlending,
  });

  const geometry = new THREE.PlaneGeometry(2, 2);
  mesh = new THREE.Mesh(geometry, materials.display);
  mesh.frustumCulled = false;
  scene.add(mesh);

  const handleResize = async () => {
    const width = window.innerWidth;
    const height = window.innerHeight;

    renderer.setSize(width, height);
    simWidth = Math.max(2, Math.round(width * RD.simScale));
    simHeight = Math.max(2, Math.round(height * RD.simScale));
    uniforms.simulation.resolution.value.set(simWidth, simHeight);

    renderTargets.forEach((rt) => rt.dispose());
    renderTargets = [
      new THREE.WebGLRenderTarget(simWidth, simHeight, {
        format: THREE.RGBAFormat,
        type: renderTargetType,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        depthBuffer: false,
        stencilBuffer: false,
      }),
      new THREE.WebGLRenderTarget(simWidth, simHeight, {
        format: THREE.RGBAFormat,
        type: renderTargetType,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        depthBuffer: false,
        stencilBuffer: false,
      }),
    ];

    await ensureTitleFontLoaded();
    seedSimulationFromCurrentImage();
  };

  window.addEventListener('resize', handleResize);
  handleResize();

  const shouldIgnorePointer = (targetEl) => {
    if (!targetEl || !targetEl.closest) return false;
    return !!targetEl.closest('.panel-stack, .effects-tabs, .controls');
  };

  const handlePointerMove = (e) => {
    if (!e.isPrimary) return;

    if (shouldIgnorePointer(e.target)) {
      uniforms.simulation.mousePosition.value.set(-1, -1);
      return;
    }

    const x = e.clientX / window.innerWidth;
    const y = 1.0 - (e.clientY / window.innerHeight);
    uniforms.simulation.mousePosition.value.set(x, y);
  };

  const handlePointerLeave = () => {
    uniforms.simulation.mousePosition.value.set(-1, -1);
  };

  window.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerleave', handlePointerLeave);

  let raf = 0;
  const animate = (time) => {
    // Subtle wobble keeps the patterns alive (similar feel to the original simulator).
    const t = time * 0.001;
    const wobble = 0.004;
    uniforms.simulation.bias.value.set(
      RD.biasX + Math.sin(t * 0.35) * wobble,
      RD.biasY + Math.cos(t * 0.27) * wobble
    );

    mesh.material = materials.simulation;
    for (let i = 0; i < RD.stepsPerFrame; i++) {
      const nextIndex = (currentRT + 1) % 2;
      uniforms.simulation.previousIterationTexture.value = renderTargets[currentRT].texture;

      renderer.setRenderTarget(renderTargets[nextIndex]);
      renderer.render(scene, camera);
      currentRT = nextIndex;
    }

    uniforms.display.textureToDisplay.value = renderTargets[currentRT].texture;
    uniforms.display.previousIterationTexture.value = renderTargets[(currentRT + 1) % 2].texture;
    uniforms.display.time.value = time * 0.001;
    mesh.material = materials.display;

    renderer.setRenderTarget(null);
    renderer.render(scene, camera);

    raf = requestAnimationFrame(animate);
  };

  raf = requestAnimationFrame(animate);

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', handleResize);
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerleave', handlePointerLeave);
    renderer.dispose();
    geometry.dispose();
  };
}

async function loadImages() {
  const loaded = await Promise.all(
    IMAGES.map((filename) => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ filename, img });
      img.onerror = reject;
      img.src = `../../_img/${filename}`;
    }))
  );
  return loaded;
}

function setupEffectsPanel() {
  const toggleBtn = document.getElementById('toggleControls');
  const controlsContent = document.getElementById('controlsContent');
  if (toggleBtn && controlsContent) {
    toggleBtn.addEventListener('click', () => {
      controlsContent.classList.toggle('collapsed');
      toggleBtn.textContent = controlsContent.classList.contains('collapsed') ? '+' : '−';
    });
  }

  const toggleTitleBtn = document.getElementById('toggleTitleControls');
  const titleControlsContent = document.getElementById('titleControlsContent');
  if (toggleTitleBtn && titleControlsContent) {
    toggleTitleBtn.addEventListener('click', () => {
      titleControlsContent.classList.toggle('collapsed');
      toggleTitleBtn.textContent = titleControlsContent.classList.contains('collapsed') ? '+' : '−';
    });
  }

  const presetSelect = document.getElementById('rdPresetSelect');
  if (presetSelect) {
    PRESETS.forEach((p, idx) => {
      const opt = document.createElement('option');
      opt.value = String(idx);
      opt.textContent = p.name;
      presetSelect.appendChild(opt);
    });

    presetSelect.addEventListener('change', (e) => {
      const idx = parseInt(e.target.value, 10);
      const preset = PRESETS[idx];
      if (!preset) return;

      RD.f = preset.f;
      RD.k = preset.k;
      uniforms.simulation.f.value = RD.f;
      uniforms.simulation.k.value = RD.k;

      setSlider('rdFSlider', 'rdFValue', RD.f, 4);
      setSlider('rdKSlider', 'rdKValue', RD.k, 4);
    });
  }

  function bindSlider(id, valueId, decimals, onValue) {
    const slider = document.getElementById(id);
    const valueEl = document.getElementById(valueId);
    if (!slider || !valueEl) return;

    const format = (v) => (decimals > 0 ? v.toFixed(decimals) : String(Math.round(v)));

    slider.addEventListener('input', (ev) => {
      const value = parseFloat(ev.target.value);
      valueEl.textContent = format(value);
      onValue(value);
    });

    valueEl.textContent = format(parseFloat(slider.value));
  }

  function setSlider(id, valueId, value, decimals) {
    const slider = document.getElementById(id);
    const valueEl = document.getElementById(valueId);
    if (!slider || !valueEl) return;
    slider.value = String(value);
    valueEl.textContent = decimals > 0 ? Number(value).toFixed(decimals) : String(Math.round(value));
  }

  function bindSliderWithNumber(id, numberId, valueId, decimals, onValue) {
    const slider = document.getElementById(id);
    const numberEl = document.getElementById(numberId);
    const valueEl = document.getElementById(valueId);
    if (!slider || !valueEl || !numberEl) {
      bindSlider(id, valueId, decimals, (v) => {
        const effective = onValue(v);
        return effective;
      });
      return;
    }

    const format = (v) => (decimals > 0 ? Number(v).toFixed(decimals) : String(Math.round(v)));

    const sync = (v) => {
      const formatted = format(v);
      slider.value = String(v);
      numberEl.value = formatted;
      valueEl.textContent = formatted;
    };

    const apply = (raw) => {
      const value = parseFloat(raw);
      if (!Number.isFinite(value)) return;
      const effective = onValue(value);
      sync(typeof effective === 'number' ? effective : value);
    };

    slider.addEventListener('input', (ev) => apply(ev.target.value));
    slider.addEventListener('change', (ev) => apply(ev.target.value));
    numberEl.addEventListener('input', (ev) => apply(ev.target.value));
    numberEl.addEventListener('change', (ev) => apply(ev.target.value));

    sync(parseFloat(slider.value));
  }

  function setSliderWithNumber(id, numberId, valueId, value, decimals) {
    setSlider(id, valueId, value, decimals);
    const numberEl = document.getElementById(numberId);
    if (numberEl) numberEl.value = decimals > 0 ? Number(value).toFixed(decimals) : String(Math.round(value));
  }

  bindSlider('rdFSlider', 'rdFValue', 4, (v) => {
    RD.f = v;
    uniforms.simulation.f.value = v;
  });

  bindSlider('rdKSlider', 'rdKValue', 4, (v) => {
    RD.k = v;
    uniforms.simulation.k.value = v;
  });

  bindSlider('rdDASlider', 'rdDAValue', 4, (v) => {
    RD.dA = v;
    uniforms.simulation.dA.value = v;
  });

  bindSlider('rdDBSlider', 'rdDBValue', 4, (v) => {
    RD.dB = v;
    uniforms.simulation.dB.value = v;
  });

  bindSlider('rdTimestepSlider', 'rdTimestepValue', 2, (v) => {
    RD.timestep = v;
    uniforms.simulation.timestep.value = v;
  });

  bindSlider('rdStepsSlider', 'rdStepsValue', 0, (v) => {
    RD.stepsPerFrame = Math.max(1, Math.round(v));
  });

  bindSlider('rdBiasXSlider', 'rdBiasXValue', 3, (v) => {
    RD.biasX = v;
    uniforms.simulation.bias.value.set(RD.biasX, RD.biasY);
  });

  bindSlider('rdBiasYSlider', 'rdBiasYValue', 3, (v) => {
    RD.biasY = v;
    uniforms.simulation.bias.value.set(RD.biasX, RD.biasY);
  });

  bindSlider('rdWarmStartSlider', 'rdWarmStartValue', 0, (v) => {
    RD.warmStartIterations = Math.max(0, Math.round(v));
  });

  bindSliderWithNumber('rdSourceStrengthSlider', 'rdSourceStrengthNumber', 'rdSourceStrengthValue', 3, (v) => {
    RD.sourceStrength = Math.max(0, Math.min(0.5, v));
    uniforms.simulation.sourceStrength.value = RD.sourceStrength;
    return RD.sourceStrength;
  });

  bindSlider('rdSimScaleSlider', 'rdSimScaleValue', 2, (v) => {
    RD.simScale = Math.max(0.25, Math.min(1, v));
    window.dispatchEvent(new Event('resize'));
  });

  bindSlider('rdBrushRadiusSlider', 'rdBrushRadiusValue', 0, (v) => {
    RD.brushRadius = v;
    uniforms.simulation.brushRadius.value = v;
  });

  bindSlider('rdStyleSlider', 'rdStyleValue', 0, (v) => {
    RD.renderingStyle = Math.round(v);
    uniforms.display.renderingStyle.value = RD.renderingStyle;
    updateRenderingControlsVisibility();
    updateStyleName();
  });

  const styleNameEl = document.getElementById('rdStyleName');
  const hslControls = document.getElementById('rdHslControls');
  const gradientControls = document.getElementById('rdGradientControls');

  const STYLE_NAMES = {
    0: 'HSL Mapping',
    1: 'Gradient',
    2: 'Purple/Yellow',
    3: 'Turquoise/Fire',
    4: 'Radioactive',
    5: 'Rainbow',
    6: 'Black & White Soft',
    7: 'Black & White Sharp',
    8: 'Red/Green Raw',
  };

  function updateStyleName() {
    if (!styleNameEl) return;
    styleNameEl.textContent = STYLE_NAMES[RD.renderingStyle] ?? String(RD.renderingStyle);
  }

  function updateRenderingControlsVisibility() {
    if (hslControls) {
      hslControls.classList.toggle('is-hidden', RD.renderingStyle !== 0);
    }
    if (gradientControls) {
      gradientControls.classList.toggle('is-hidden', RD.renderingStyle !== 1);
    }
  }

  function hexToRgb01(hex) {
    const h = String(hex || '').replace('#', '').trim();
    if (h.length !== 6) return { r: 0, g: 0, b: 0 };
    const n = parseInt(h, 16);
    return {
      r: ((n >> 16) & 255) / 255,
      g: ((n >> 8) & 255) / 255,
      b: (n & 255) / 255,
    };
  }

  function setColorStopUniform(which, hex, stop) {
    const rgb = hexToRgb01(hex);
    const v = uniforms.display[which]?.value;
    if (!v) return;
    v.set(rgb.r, rgb.g, rgb.b, stop);
  }

  // Gradient controls (style 1)
  const grad = {
    c1: document.getElementById('rdColor1'), s1: document.getElementById('rdStop1Slider'), v1: document.getElementById('rdStop1Value'),
    c2: document.getElementById('rdColor2'), s2: document.getElementById('rdStop2Slider'), v2: document.getElementById('rdStop2Value'),
    c3: document.getElementById('rdColor3'), s3: document.getElementById('rdStop3Slider'), v3: document.getElementById('rdStop3Value'),
    c4: document.getElementById('rdColor4'), s4: document.getElementById('rdStop4Slider'), v4: document.getElementById('rdStop4Value'),
    c5: document.getElementById('rdColor5'), s5: document.getElementById('rdStop5Slider'), v5: document.getElementById('rdStop5Value'),
  };

  function bindStop(colorEl, stopEl, valueEl, which, defaultHex, defaultStop) {
    if (colorEl) colorEl.value = defaultHex;
    if (stopEl) stopEl.value = String(defaultStop);
    if (valueEl) valueEl.textContent = Number(defaultStop).toFixed(2);

    setColorStopUniform(which, colorEl?.value ?? defaultHex, parseFloat(stopEl?.value ?? defaultStop));

    if (colorEl) {
      colorEl.addEventListener('input', () => {
        const s = parseFloat(stopEl?.value ?? defaultStop);
        setColorStopUniform(which, colorEl.value, s);
      });
    }

    if (stopEl) {
      stopEl.addEventListener('input', () => {
        const s = parseFloat(stopEl.value);
        if (valueEl) valueEl.textContent = Number(s).toFixed(2);
        setColorStopUniform(which, colorEl?.value ?? defaultHex, s);
      });
    }
  }

  bindStop(grad.c1, grad.s1, grad.v1, 'colorStop1', COLORS.color1, COLORS.stop1);
  bindStop(grad.c2, grad.s2, grad.v2, 'colorStop2', COLORS.color2, COLORS.stop2);
  bindStop(grad.c3, grad.s3, grad.v3, 'colorStop3', COLORS.color3, COLORS.stop3);
  bindStop(grad.c4, grad.s4, grad.v4, 'colorStop4', COLORS.color4, COLORS.stop4);
  bindStop(grad.c5, grad.s5, grad.v5, 'colorStop5', COLORS.color5, COLORS.stop5);

  // HSL controls (style 0)
  bindSlider('rdHslFromMinSlider', 'rdHslFromMinValue', 2, (v) => {
    uniforms.display.hslFrom.value.set(v, uniforms.display.hslFrom.value.y);
  });
  bindSlider('rdHslFromMaxSlider', 'rdHslFromMaxValue', 2, (v) => {
    uniforms.display.hslFrom.value.set(uniforms.display.hslFrom.value.x, v);
  });
  bindSlider('rdHslToMinSlider', 'rdHslToMinValue', 2, (v) => {
    uniforms.display.hslTo.value.set(v, uniforms.display.hslTo.value.y);
  });
  bindSlider('rdHslToMaxSlider', 'rdHslToMaxValue', 2, (v) => {
    uniforms.display.hslTo.value.set(uniforms.display.hslTo.value.x, v);
  });
  bindSlider('rdHslSatSlider', 'rdHslSatValue', 2, (v) => {
    uniforms.display.hslSaturation.value = v;
  });
  bindSlider('rdHslLumSlider', 'rdHslLumValue', 2, (v) => {
    uniforms.display.hslLuminosity.value = v;
  });

  // Initialize conditional visibility + label
  updateRenderingControlsVisibility();
  updateStyleName();

  const reseedBtn = document.getElementById('rdReseedBtn');
  if (reseedBtn) {
    reseedBtn.addEventListener('click', () => {
      seedSimulationFromCurrentImage();
    });
  }

  const saveJsonBtn = document.getElementById('rdSaveJsonBtn');
  const loadJsonBtn = document.getElementById('rdLoadJsonBtn');
  const loadJsonFile = document.getElementById('rdLoadJsonFile');

  const collectSettings = () => ({
    version: 1,
    // Intentionally excludes image loading / image index.
    RD: {
      f: RD.f,
      k: RD.k,
      dA: RD.dA,
      dB: RD.dB,
      timestep: RD.timestep,
      brushRadius: RD.brushRadius,
      stepsPerFrame: RD.stepsPerFrame,
      renderingStyle: RD.renderingStyle,
      warmStartIterations: RD.warmStartIterations,
      simScale: RD.simScale,
      biasX: RD.biasX,
      biasY: RD.biasY,
      sourceStrength: RD.sourceStrength,
    },
    COLORS: { ...COLORS },
    TITLE: { ...TITLE },
  });

  const pushColorsToUniforms = () => {
    const rgb = (hex) => {
      const h = String(hex || '').replace('#', '').trim();
      if (h.length !== 6) return { r: 0, g: 0, b: 0 };
      const n = parseInt(h, 16);
      return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
    };

    const c1 = rgb(COLORS.color1); uniforms.display.colorStop1.value.set(c1.r, c1.g, c1.b, COLORS.stop1);
    const c2 = rgb(COLORS.color2); uniforms.display.colorStop2.value.set(c2.r, c2.g, c2.b, COLORS.stop2);
    const c3 = rgb(COLORS.color3); uniforms.display.colorStop3.value.set(c3.r, c3.g, c3.b, COLORS.stop3);
    const c4 = rgb(COLORS.color4); uniforms.display.colorStop4.value.set(c4.r, c4.g, c4.b, COLORS.stop4);
    const c5 = rgb(COLORS.color5); uniforms.display.colorStop5.value.set(c5.r, c5.g, c5.b, COLORS.stop5);

    uniforms.display.hslFrom.value.set(COLORS.hslFromMin, COLORS.hslFromMax);
    uniforms.display.hslTo.value.set(COLORS.hslToMin, COLORS.hslToMax);
    uniforms.display.hslSaturation.value = COLORS.hslSaturation;
    uniforms.display.hslLuminosity.value = COLORS.hslLuminosity;
  };

  const applySettings = async (settings) => {
    if (!settings || typeof settings !== 'object') return;

    const sRD = settings.RD || {};
    if (typeof sRD.f === 'number') RD.f = sRD.f;
    if (typeof sRD.k === 'number') RD.k = sRD.k;
    if (typeof sRD.dA === 'number') RD.dA = sRD.dA;
    if (typeof sRD.dB === 'number') RD.dB = sRD.dB;
    if (typeof sRD.timestep === 'number') RD.timestep = sRD.timestep;
    if (typeof sRD.brushRadius === 'number') RD.brushRadius = sRD.brushRadius;
    if (typeof sRD.stepsPerFrame === 'number') RD.stepsPerFrame = sRD.stepsPerFrame;
    if (typeof sRD.renderingStyle === 'number') RD.renderingStyle = sRD.renderingStyle;
    if (typeof sRD.warmStartIterations === 'number') RD.warmStartIterations = sRD.warmStartIterations;
    if (typeof sRD.simScale === 'number') RD.simScale = Math.max(0.25, Math.min(1, sRD.simScale));
    if (typeof sRD.biasX === 'number') RD.biasX = sRD.biasX;
    if (typeof sRD.biasY === 'number') RD.biasY = sRD.biasY;
    if (typeof sRD.sourceStrength === 'number') RD.sourceStrength = Math.max(0, Math.min(0.5, sRD.sourceStrength));

    const sColors = settings.COLORS || {};
    Object.keys(COLORS).forEach((k) => {
      if (k in sColors) COLORS[k] = sColors[k];
    });

    const sTitle = settings.TITLE || {};
    Object.keys(TITLE).forEach((k) => {
      if (k in sTitle) TITLE[k] = sTitle[k];
    });

    uniforms.simulation.f.value = RD.f;
    uniforms.simulation.k.value = RD.k;
    uniforms.simulation.dA.value = RD.dA;
    uniforms.simulation.dB.value = RD.dB;
    uniforms.simulation.timestep.value = RD.timestep;
    uniforms.simulation.brushRadius.value = RD.brushRadius;
    uniforms.simulation.bias.value.set(RD.biasX, RD.biasY);
    uniforms.simulation.sourceStrength.value = RD.sourceStrength;

    uniforms.display.renderingStyle.value = RD.renderingStyle;
    pushColorsToUniforms();

    setSlider('rdFSlider', 'rdFValue', RD.f, 4);
    setSlider('rdKSlider', 'rdKValue', RD.k, 4);
    setSlider('rdDASlider', 'rdDAValue', RD.dA, 4);
    setSlider('rdDBSlider', 'rdDBValue', RD.dB, 4);
    setSlider('rdTimestepSlider', 'rdTimestepValue', RD.timestep, 2);
    setSlider('rdStepsSlider', 'rdStepsValue', RD.stepsPerFrame, 0);
    setSlider('rdBrushRadiusSlider', 'rdBrushRadiusValue', RD.brushRadius, 0);
    setSlider('rdStyleSlider', 'rdStyleValue', RD.renderingStyle, 0);
    setSlider('rdBiasXSlider', 'rdBiasXValue', RD.biasX, 3);
    setSlider('rdBiasYSlider', 'rdBiasYValue', RD.biasY, 3);
    setSlider('rdWarmStartSlider', 'rdWarmStartValue', RD.warmStartIterations, 0);
    setSliderWithNumber('rdSourceStrengthSlider', 'rdSourceStrengthNumber', 'rdSourceStrengthValue', RD.sourceStrength, 3);
    setSlider('rdSimScaleSlider', 'rdSimScaleValue', RD.simScale, 2);

    // Update gradient inputs
    if (grad.c1) grad.c1.value = COLORS.color1;
    if (grad.s1) grad.s1.value = String(COLORS.stop1);
    if (grad.v1) grad.v1.textContent = Number(COLORS.stop1).toFixed(2);

    if (grad.c2) grad.c2.value = COLORS.color2;
    if (grad.s2) grad.s2.value = String(COLORS.stop2);
    if (grad.v2) grad.v2.textContent = Number(COLORS.stop2).toFixed(2);

    if (grad.c3) grad.c3.value = COLORS.color3;
    if (grad.s3) grad.s3.value = String(COLORS.stop3);
    if (grad.v3) grad.v3.textContent = Number(COLORS.stop3).toFixed(2);

    if (grad.c4) grad.c4.value = COLORS.color4;
    if (grad.s4) grad.s4.value = String(COLORS.stop4);
    if (grad.v4) grad.v4.textContent = Number(COLORS.stop4).toFixed(2);

    if (grad.c5) grad.c5.value = COLORS.color5;
    if (grad.s5) grad.s5.value = String(COLORS.stop5);
    if (grad.v5) grad.v5.textContent = Number(COLORS.stop5).toFixed(2);

    // Update HSL slider UI values
    setSlider('rdHslFromMinSlider', 'rdHslFromMinValue', COLORS.hslFromMin, 2);
    setSlider('rdHslFromMaxSlider', 'rdHslFromMaxValue', COLORS.hslFromMax, 2);
    setSlider('rdHslToMinSlider', 'rdHslToMinValue', COLORS.hslToMin, 2);
    setSlider('rdHslToMaxSlider', 'rdHslToMaxValue', COLORS.hslToMax, 2);
    setSlider('rdHslSatSlider', 'rdHslSatValue', COLORS.hslSaturation, 2);
    setSlider('rdHslLumSlider', 'rdHslLumValue', COLORS.hslLuminosity, 2);

    // Update title UI
    if (titleTextInput) titleTextInput.value = TITLE.text;
    if (titleShowToggle) titleShowToggle.checked = !!TITLE.enabled;
    if (titleSizeSlider) titleSizeSlider.value = String(TITLE.sizePercent);
    if (titleSizeValue) titleSizeValue.textContent = String(TITLE.sizePercent);
    if (titleFillColor) titleFillColor.value = TITLE.fillColor;
    if (titleStrokeColor) titleStrokeColor.value = TITLE.strokeColor;
    if (titleStrokeWidthSlider) titleStrokeWidthSlider.value = String(TITLE.strokeWidth);
    if (titleStrokeWidthValue) titleStrokeWidthValue.textContent = String(TITLE.strokeWidth);
    if (titleShadowToggle) titleShadowToggle.checked = !!TITLE.shadowEnabled;
    if (titleShadowColor) titleShadowColor.value = TITLE.shadowColor;
    if (titleShadowBlurSlider) titleShadowBlurSlider.value = String(TITLE.shadowBlur);
    if (titleShadowBlurValue) titleShadowBlurValue.textContent = String(TITLE.shadowBlur);
    if (titleShadowOffsetXSlider) titleShadowOffsetXSlider.value = String(TITLE.shadowOffsetX);
    if (titleShadowOffsetXValue) titleShadowOffsetXValue.textContent = String(TITLE.shadowOffsetX);
    if (titleShadowOffsetYSlider) titleShadowOffsetYSlider.value = String(TITLE.shadowOffsetY);
    if (titleShadowOffsetYValue) titleShadowOffsetYValue.textContent = String(TITLE.shadowOffsetY);

    updateRenderingControlsVisibility();
    updateStyleName();

    await ensureTitleFontLoaded();
    window.dispatchEvent(new Event('resize'));
    seedSimulationFromCurrentImage();
  };

  const downloadText = (filename, text) => {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  if (saveJsonBtn) {
    saveJsonBtn.addEventListener('click', () => {
      downloadText('rd-04-settings.json', JSON.stringify(collectSettings(), null, 2));
    });
  }

  if (loadJsonBtn && loadJsonFile) {
    loadJsonBtn.addEventListener('click', () => loadJsonFile.click());
    loadJsonFile.addEventListener('change', async () => {
      const file = loadJsonFile.files?.[0];
      if (!file) return;
      const text = await file.text();
      const settings = JSON.parse(text);
      await applySettings(settings);
      loadJsonFile.value = '';
    });
  }

  const titleTextInput = document.getElementById('titleTextInput');
  const titleShowToggle = document.getElementById('titleShowToggle');

  const titleSizeSlider = document.getElementById('titleSizeSlider');
  const titleSizeValue = document.getElementById('titleSizeValue');

  const titleFillColor = document.getElementById('titleFillColor');
  const titleStrokeColor = document.getElementById('titleStrokeColor');

  const titleStrokeWidthSlider = document.getElementById('titleStrokeWidthSlider');
  const titleStrokeWidthValue = document.getElementById('titleStrokeWidthValue');

  const titleShadowToggle = document.getElementById('titleShadowToggle');
  const titleShadowColor = document.getElementById('titleShadowColor');

  const titleShadowBlurSlider = document.getElementById('titleShadowBlurSlider');
  const titleShadowBlurValue = document.getElementById('titleShadowBlurValue');

  const titleShadowOffsetXSlider = document.getElementById('titleShadowOffsetXSlider');
  const titleShadowOffsetXValue = document.getElementById('titleShadowOffsetXValue');

  const titleShadowOffsetYSlider = document.getElementById('titleShadowOffsetYSlider');
  const titleShadowOffsetYValue = document.getElementById('titleShadowOffsetYValue');

  if (titleTextInput) titleTextInput.value = TITLE.text;
  if (titleShowToggle) titleShowToggle.checked = TITLE.enabled;

  if (titleSizeSlider && titleSizeValue) {
    titleSizeSlider.value = String(TITLE.sizePercent);
    titleSizeValue.textContent = Number(TITLE.sizePercent).toFixed(1);
  }

  if (titleFillColor) titleFillColor.value = TITLE.fillColor;
  if (titleStrokeColor) titleStrokeColor.value = TITLE.strokeColor;

  if (titleStrokeWidthSlider && titleStrokeWidthValue) {
    titleStrokeWidthSlider.value = String(TITLE.strokeWidth);
    titleStrokeWidthValue.textContent = Number(TITLE.strokeWidth).toFixed(1);
  }

  if (titleShadowToggle) titleShadowToggle.checked = TITLE.shadowEnabled;
  if (titleShadowColor) titleShadowColor.value = TITLE.shadowColor;

  if (titleShadowBlurSlider && titleShadowBlurValue) {
    titleShadowBlurSlider.value = String(TITLE.shadowBlur);
    titleShadowBlurValue.textContent = String(Math.round(TITLE.shadowBlur));
  }

  if (titleShadowOffsetXSlider && titleShadowOffsetXValue) {
    titleShadowOffsetXSlider.value = String(TITLE.shadowOffsetX);
    titleShadowOffsetXValue.textContent = String(Math.round(TITLE.shadowOffsetX));
  }

  if (titleShadowOffsetYSlider && titleShadowOffsetYValue) {
    titleShadowOffsetYSlider.value = String(TITLE.shadowOffsetY);
    titleShadowOffsetYValue.textContent = String(Math.round(TITLE.shadowOffsetY));
  }

  const resetFromTitle = async () => {
    await ensureTitleFontLoaded();
    seedSimulationFromCurrentImage();
  };

  if (titleTextInput) {
    titleTextInput.addEventListener('input', async (e) => {
      TITLE.text = e.target.value;
      await resetFromTitle();
    });
  }

  if (titleShowToggle) {
    titleShowToggle.addEventListener('change', async (e) => {
      TITLE.enabled = e.target.checked;
      await resetFromTitle();
    });
  }

  if (titleSizeSlider && titleSizeValue) {
    titleSizeSlider.addEventListener('input', async (e) => {
      const value = parseFloat(e.target.value);
      if (Number.isNaN(value)) return;
      TITLE.sizePercent = value;
      titleSizeValue.textContent = value.toFixed(1);
      await resetFromTitle();
    });
  }

  if (titleFillColor) {
    titleFillColor.addEventListener('input', async (e) => {
      TITLE.fillColor = e.target.value;
      await resetFromTitle();
    });
  }

  if (titleStrokeColor) {
    titleStrokeColor.addEventListener('input', async (e) => {
      TITLE.strokeColor = e.target.value;
      await resetFromTitle();
    });
  }

  if (titleStrokeWidthSlider && titleStrokeWidthValue) {
    titleStrokeWidthSlider.addEventListener('input', async (e) => {
      const value = parseFloat(e.target.value);
      if (Number.isNaN(value)) return;
      TITLE.strokeWidth = value;
      titleStrokeWidthValue.textContent = value.toFixed(1);
      await resetFromTitle();
    });
  }

  if (titleShadowToggle) {
    titleShadowToggle.addEventListener('change', async (e) => {
      TITLE.shadowEnabled = e.target.checked;
      await resetFromTitle();
    });
  }

  if (titleShadowColor) {
    titleShadowColor.addEventListener('input', async (e) => {
      TITLE.shadowColor = e.target.value;
      await resetFromTitle();
    });
  }

  if (titleShadowBlurSlider && titleShadowBlurValue) {
    titleShadowBlurSlider.addEventListener('input', async (e) => {
      const value = parseFloat(e.target.value);
      if (Number.isNaN(value)) return;
      TITLE.shadowBlur = value;
      titleShadowBlurValue.textContent = String(Math.round(value));
      await resetFromTitle();
    });
  }

  if (titleShadowOffsetXSlider && titleShadowOffsetXValue) {
    titleShadowOffsetXSlider.addEventListener('input', async (e) => {
      const value = parseFloat(e.target.value);
      if (Number.isNaN(value)) return;
      TITLE.shadowOffsetX = value;
      titleShadowOffsetXValue.textContent = String(Math.round(value));
      await resetFromTitle();
    });
  }

  if (titleShadowOffsetYSlider && titleShadowOffsetYValue) {
    titleShadowOffsetYSlider.addEventListener('input', async (e) => {
      const value = parseFloat(e.target.value);
      if (Number.isNaN(value)) return;
      TITLE.shadowOffsetY = value;
      titleShadowOffsetYValue.textContent = String(Math.round(value));
      await resetFromTitle();
    });
  }
}

function setupImageRolling() {
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');

  const changeImage = async (dir) => {
    currentImageIndex = (currentImageIndex + dir + images.length) % images.length;
    updateImageName(currentImageIndex);
    setBodyBackground(images[currentImageIndex].filename);
    await ensureTitleFontLoaded();
    seedSimulationFromCurrentImage();
  };

  if (prevBtn) prevBtn.addEventListener('click', () => changeImage(-1));
  if (nextBtn) nextBtn.addEventListener('click', () => changeImage(1));

  document.addEventListener('keydown', (e) => {
    if (!images.length) return;
    if (e.key === 'ArrowLeft') changeImage(-1);
    else if (e.key === 'ArrowRight') changeImage(1);
  });
}

async function main() {
  const canvas = document.getElementById('canvas');
  if (!canvas) throw new Error('Missing #canvas');

  images = await loadImages();
  updateImageName(currentImageIndex);
  setBodyBackground(images[currentImageIndex].filename);

  const hidden = document.getElementById('hiddenImages');
  if (hidden) {
    hidden.innerHTML = '';
    images.forEach(({ filename }) => {
      const img = document.createElement('img');
      img.className = 'source-img';
      img.alt = filename;
      img.src = `../../_img/${filename}`;
      hidden.appendChild(img);
    });
  }

  setupEffectsPanel();
  setupImageRolling();

  await ensureTitleFontLoaded();
  setupThree(canvas);
}

window.addEventListener('load', () => {
  main().catch((err) => {
    console.error('[RD-02] Failed to start:', err);
  });
});
