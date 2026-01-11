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
  { name: 'Chaos to Turing negatons', f: 0.039, k: 0.058 },
  { name: 'Fingerprints', f: 0.037, k: 0.06 },
  { name: 'Chaos with negatons', f: 0.0353, k: 0.0566 },
  { name: 'Spots and worms', f: 0.034, k: 0.0618 },
  { name: 'Self-replicating spots', f: 0.03, k: 0.063 },
  { name: 'Super-resonant mazes', f: 0.03, k: 0.0565 },
  { name: 'Mazes', f: 0.029, k: 0.057 },
  { name: 'Mazes with some chaos', f: 0.026, k: 0.055 },
  { name: 'Chaos', f: 0.026, k: 0.051 },
  { name: 'Pulsating solitons', f: 0.025, k: 0.06 },
  { name: 'Warring microbes', f: 0.022, k: 0.059 },
  { name: 'Spots and loops', f: 0.018, k: 0.051 },
  { name: 'Moving spots', f: 0.014, k: 0.054 },
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
};

// ============================================
// SHADERS (copied from reaction-diffusion-react)
// ============================================

const simulationVert = `
uniform vec2 resolution;

varying vec2 v_uvs[9];
varying vec2 texelStep;

void main() {
  texelStep = 1.0 / resolution.xy;

  // Center texel
  v_uvs[0] = uv;

  // Orthogonal texels
  v_uvs[1] = uv + vec2(0.0, -texelStep.y);  // top
  v_uvs[2] = uv + vec2(texelStep.x, 0.0);   // right
  v_uvs[3] = uv + vec2(0.0, texelStep.y);   // bottom
  v_uvs[4] = uv + vec2(-texelStep.x, 0.0);  // left

  // Diagonal texels
  v_uvs[5] = uv + vec2(texelStep.x, -texelStep.y);   // top-right
  v_uvs[6] = uv + vec2(texelStep.x, texelStep.y);    // bottom-right
  v_uvs[7] = uv + vec2(-texelStep.x, texelStep.y);   // bottom-left
  v_uvs[8] = uv + vec2(-texelStep.x, -texelStep.y);  // top-left

  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const simulationFrag = `
/**
- Red channel = concentration of chemical A (0.0 - 1.0)
- Green channel = concentration of chemical B (0.0 - 1.0)
*/

uniform sampler2D previousIterationTexture;

uniform float f;
uniform float k;
uniform float dA;
uniform float dB;
uniform float timestep;

uniform vec2 mousePosition;
uniform float brushRadius;

uniform sampler2D styleMapTexture;
uniform vec4 styleMapTransforms;
uniform vec4 styleMapParameters;
uniform vec2 styleMapResolution;

uniform vec2 bias;

uniform vec2 resolution;

varying vec2 v_uvs[9];

vec3 weights[3];

void setWeights(int type) {
  // Karl Sim's weights from http://www.karlsims.com/rd.html
  if(type == 0) {
    weights[0] = vec3(0.05,  0.2,  0.05);
    weights[1] = vec3(0.2,  -1.0,  0.2);
    weights[2] = vec3(0.05,  0.2,  0.05);

  // Standard (?) 9-point stencil from https://en.wikipedia.org/wiki/Discrete_Laplace_operator
  } else if(type == 1) {
    weights[0] = vec3(0.25,  0.5,  0.25);
    weights[1] = vec3(0.5,  -3.0,  0.5);
    weights[2] = vec3(0.25,  0.5,  0.25);

  // 5-point stencil from Xmoprhoa/pmneila source code
  } else if(type == 2) {
    weights[0] = vec3(0.0,  1.0,  0.0);
    weights[1] = vec3(1.0, -4.0,  1.0);
    weights[2] = vec3(0.0,  1.0,  0.0);
  }
}

vec2 getLaplacian(vec4 centerTexel) {
  // Begin by setting up the Laplacian stencil weights based on desired model
  setWeights(2);

  // Start with center value
  vec2 laplacian = centerTexel.xy * weights[1][1];  // center

  // Add in orthogonal values
  laplacian += texture2D(previousIterationTexture, fract(v_uvs[1])).xy * (weights[0][1] + bias.y);  // top
  laplacian += texture2D(previousIterationTexture, fract(v_uvs[2])).xy * (weights[1][2] + bias.x);  // right
  laplacian += texture2D(previousIterationTexture, fract(v_uvs[3])).xy * (weights[2][1] - bias.y);  // bottom
  laplacian += texture2D(previousIterationTexture, fract(v_uvs[4])).xy * (weights[1][0] - bias.x);  // left

  // Add in diagonal values
  laplacian += texture2D(previousIterationTexture, fract(v_uvs[5])).xy * weights[0][2];  // top-right
  laplacian += texture2D(previousIterationTexture, fract(v_uvs[6])).xy * weights[2][2];  // bottom-right
  laplacian += texture2D(previousIterationTexture, fract(v_uvs[7])).xy * weights[2][0];  // bottom-left
  laplacian += texture2D(previousIterationTexture, fract(v_uvs[8])).xy * weights[0][0];  // top-left

  return laplacian;
}

vec4 getStyleMapTexel(vec2 uv) {
  vec4 texel = vec4(-1.0, -1.0, -1.0, -1.0);

  float scale = styleMapTransforms[0];
  float angle = styleMapTransforms[1];
  float xOffset = - styleMapTransforms[2] / resolution.x;
  float yOffset = styleMapTransforms[3] / resolution.y;

  vec2 transformedUV = uv;

  // Calculate translation (X and Y)
  transformedUV.x += xOffset;
  transformedUV.y += yOffset;

  // Calculate scale
  transformedUV /= scale;

  // Calculate rotation
  float s = sin(angle);
  float c = cos(angle);
  mat2 rotationMatrix = mat2(c, s, -s, c);
  vec2 pivot = vec2(0.5, 0.5);
  transformedUV = rotationMatrix * (transformedUV - pivot) + pivot;

  texel = texture2D(styleMapTexture, transformedUV);

  return texel;
}

void main() {
  // Get A/B chemical data
  vec4 centerTexel = texture2D(previousIterationTexture, v_uvs[0]);
  float A = centerTexel[0];
  float B = centerTexel[1];

  // Copy the f/k/dA/dB parameters so they can be modified locally ("n" for "new")
  float nf = f;
  float nk = k;
  float ndA = dA;
  float ndB = dB;

  // If a style map image is set, smoothly interpolate between the main f/k/dA/dB and the f/k/dA/dB values set in the Style Map pane
  if(styleMapResolution != vec2(-1.0, -1.0)) {
    // Get the style map texel that corresponds with this location
    vec4 styleMapTexel = getStyleMapTexel(v_uvs[0]);

    float luminance = 0.3 * styleMapTexel.r + 0.59 * styleMapTexel.g + 0.11 * styleMapTexel.b;
    nf = mix(f, styleMapParameters[0], luminance);
    nk = mix(k, styleMapParameters[1], luminance);
    ndA = mix(dA, styleMapParameters[2], luminance);
    ndB = mix(dB, styleMapParameters[3], luminance);
  }

  // Draw more of the B chemical around the mouse on mouse down
  if(mousePosition.x > 0.0 && mousePosition.y > 0.0) {
    float distToMouse = distance(mousePosition * resolution, v_uvs[0] * resolution);

    if(distToMouse < brushRadius) {
      gl_FragColor = vec4(mix(0.0, 0.3, distToMouse/brushRadius), 0.5, 0.0, 1.0);
      return;
    }
  }

  // Pre-calculate complex and repeated terms
  vec2 laplacian = getLaplacian(centerTexel);
  float reactionTerm = A * B * B;

  gl_FragColor = vec4(
    A + ((ndA * laplacian[0] - reactionTerm + nf * (1.0 - A)) * timestep),
    B + ((ndB * laplacian[1] + reactionTerm - (nk + nf) * B) * timestep),
    centerTexel.b,
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

  } else {
    outputColor = pixel;
  }

  float overlayAlpha = smoothstep(0.0, 0.05, B);
  gl_FragColor = vec4(outputColor.rgb, overlayAlpha);
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
let renderTargetType = THREE.HalfFloatType;

let seedCanvas;
let seedCtx;

const uniforms = {
  simulation: {
    previousIterationTexture: { value: null },
    resolution: { value: new THREE.Vector2(900, 900) },
    mousePosition: { value: new THREE.Vector2(-1, -1) },
    brushRadius: { value: RD.brushRadius },
    f: { value: RD.f },
    k: { value: RD.k },
    dA: { value: RD.dA },
    dB: { value: RD.dB },
    timestep: { value: RD.timestep },

    styleMapTexture: { value: new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat) },
    styleMapTransforms: { value: new THREE.Vector4(1, 0, 0, 0) },
    styleMapParameters: { value: new THREE.Vector4(RD.f, RD.k, RD.dA, RD.dB) },
    styleMapResolution: { value: new THREE.Vector2(-1, -1) },
    bias: { value: new THREE.Vector2(0, 0) },
  },
  display: {
    textureToDisplay: { value: null },
    previousIterationTexture: { value: null },
    time: { value: 0 },
    renderingStyle: { value: RD.renderingStyle },
    colorStop1: { value: new THREE.Vector4(0, 0, 0, 0) },
    colorStop2: { value: new THREE.Vector4(0, 0, 0, 0.2) },
    colorStop3: { value: new THREE.Vector4(0, 0, 0, 0.4) },
    colorStop4: { value: new THREE.Vector4(0, 0, 0, 0.6) },
    colorStop5: { value: new THREE.Vector4(0, 0, 0, 0.8) },
    hslFrom: { value: new THREE.Vector2(0, 1) },
    hslTo: { value: new THREE.Vector2(0, 1) },
    hslSaturation: { value: 1.0 },
    hslLuminosity: { value: 0.5 },
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
  document.body.style.backgroundImage = `url(../../_img/${filename})`;
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

  seedCtx.drawImage(imageEl, dx, dy, drawW, drawH);
}

function seedCanvasToDataTexture(width, height) {
  const pixels = seedCtx.getImageData(0, 0, width, height).data;
  const data = new Uint8Array(pixels.length);

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];

    // Luminance drives chemical B. Invert so darker => more B.
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const bChem = Math.max(0, Math.min(255, Math.round((1 - lum) * 255)));

    data[i] = 255;        // A
    data[i + 1] = bChem;  // B
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

function seedSimulationFromCurrentImage() {
  if (!images.length || !renderer || renderTargets.length < 2) return;

  const width = window.innerWidth;
  const height = window.innerHeight;

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

  const seedTexture = seedCanvasToDataTexture(width, height);

  // Copy seed into both ping-pong targets
  mesh.material = materials.passthrough;
  uniforms.passthrough.textureToDisplay.value = seedTexture;

  renderer.setRenderTarget(renderTargets[0]);
  renderer.render(scene, camera);
  renderer.setRenderTarget(renderTargets[1]);
  renderer.render(scene, camera);

  renderer.setRenderTarget(null);
  currentRT = 0;
}

function setupThree(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, preserveDrawingBuffer: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setClearColor(0x000000, 0);

  const has = (ext) => renderer.extensions && renderer.extensions.has && renderer.extensions.has(ext);
  const isWebGL2 = !!renderer.capabilities?.isWebGL2;
  if (isWebGL2) {
    renderTargetType = has('EXT_color_buffer_float') ? THREE.HalfFloatType : THREE.UnsignedByteType;
  } else {
    renderTargetType = has('EXT_color_buffer_half_float')
      ? THREE.HalfFloatType
      : has('WEBGL_color_buffer_float')
        ? THREE.FloatType
        : THREE.UnsignedByteType;
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
    uniforms.simulation.resolution.value.set(width, height);

    renderTargets.forEach((rt) => rt.dispose());
    renderTargets = [
      new THREE.WebGLRenderTarget(width, height, {
        format: THREE.RGBAFormat,
        type: renderTargetType,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        depthBuffer: false,
        stencilBuffer: false,
      }),
      new THREE.WebGLRenderTarget(width, height, {
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

  const handleMouseMove = (e) => {
    if (e.buttons === 1) {
      const x = e.clientX / window.innerWidth;
      const y = 1.0 - (e.clientY / window.innerHeight);
      uniforms.simulation.mousePosition.value.set(x, y);
    } else {
      uniforms.simulation.mousePosition.value.set(-1, -1);
    }
  };

  window.addEventListener('mousemove', handleMouseMove);

  let raf = 0;
  const animate = (time) => {
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
    window.removeEventListener('mousemove', handleMouseMove);
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

  bindSlider('rdBrushRadiusSlider', 'rdBrushRadiusValue', 0, (v) => {
    RD.brushRadius = v;
    uniforms.simulation.brushRadius.value = v;
  });

  bindSlider('rdStyleSlider', 'rdStyleValue', 0, (v) => {
    RD.renderingStyle = Math.round(v);
    uniforms.display.renderingStyle.value = RD.renderingStyle;
  });

  // Title controls
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

  // Populate hidden images (keeps parity with other pages)
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
