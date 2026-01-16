// ============================================
// CONFIGURATION
// ============================================

// List of images in _img folder
const THUMBNAIL_IMAGES = [
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
  '16.jpg'
];

// Layer 2: Title settings (composited into the source so the effect applies to layer 2 + 3)
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

// Metaball system configuration
const CONFIG = {
  // Detail & Rendering
  gridResolution: 2,
  influenceRadius: 5,
  falloffPower: 3.5,
  lineWidth: 1.5,

  // Animation Speed
  thresholdSpeed: 0.01,       // Base oscillation speed
  noiseSpeed: 0.005,          // Noise evolution speed

  // Threshold Range
  thresholdMin: 0.2,
  thresholdMax: 0.8,

  // Noise Settings
  noiseScale: 0.003,
  noiseStrength: 0.5,         // Increased for more organic variation

  // Mouse Interaction
  mouseRadius: 115,
  mouseStrength: 0.5,

  // Other
  transitionDuration: 1500,
};

// ============================================
// PERLIN NOISE IMPLEMENTATION
// ============================================

class PerlinNoise {
  constructor() {
    this.permutation = [];
    for (let i = 0; i < 256; i++) {
      this.permutation[i] = i;
    }
    // Shuffle
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.permutation[i], this.permutation[j]] = [this.permutation[j], this.permutation[i]];
    }
    // Duplicate for overflow
    this.p = [...this.permutation, ...this.permutation];
  }

  fade(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  lerp(t, a, b) {
    return a + t * (b - a);
  }

  grad(hash, x, y, z = 0) {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  noise(x, y, z = 0) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;

    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);

    const u = this.fade(x);
    const v = this.fade(y);
    const w = this.fade(z);

    const A = this.p[X] + Y;
    const AA = this.p[A] + Z;
    const AB = this.p[A + 1] + Z;
    const B = this.p[X + 1] + Y;
    const BA = this.p[B] + Z;
    const BB = this.p[B + 1] + Z;

    return this.lerp(w,
      this.lerp(v,
        this.lerp(u, this.grad(this.p[AA], x, y, z), this.grad(this.p[BA], x - 1, y, z)),
        this.lerp(u, this.grad(this.p[AB], x, y - 1, z), this.grad(this.p[BB], x - 1, y - 1, z))
      ),
      this.lerp(v,
        this.lerp(u, this.grad(this.p[AA + 1], x, y, z - 1), this.grad(this.p[BA + 1], x - 1, y, z - 1)),
        this.lerp(u, this.grad(this.p[AB + 1], x, y - 1, z - 1), this.grad(this.p[BB + 1], x - 1, y - 1, z - 1))
      )
    );
  }
}

const perlinNoise = new PerlinNoise();

async function ensureTitleFontLoaded() {
  if (!document.fonts || !document.fonts.load) return;
  try {
    await document.fonts.load(`16px ${TITLE_FONT_FAMILY}`);
  } catch {
    // Ignore font loading failures; canvas will fall back.
  }
}

// ============================================
// DYNAMIC IMAGE LOADING
// ============================================

function populateHiddenImages() {
  const hiddenImagesContainer = document.getElementById('hiddenImages');

  THUMBNAIL_IMAGES.forEach((filename, index) => {
    const img = document.createElement('img');
    img.src = `../../_img/${filename}`;
    img.alt = `Image ${index + 1}`;
    img.className = 'source-img';
    img.dataset.index = index;
    hiddenImagesContainer.appendChild(img);
  });
}

// ============================================
// MARCHING SQUARES LOOKUP TABLES
// ============================================

// Edge lookup table for marching squares
// Each index represents a 4-bit configuration of corners
// Bits represent: top-left, top-right, bottom-right, bottom-left
const EDGE_TABLE = [
  [],           // 0: 0000
  [3, 0],       // 1: 0001
  [0, 1],       // 2: 0010
  [3, 1],       // 3: 0011
  [1, 2],       // 4: 0100
  [0, 1, 2, 3], // 5: 0101 (ambiguous)
  [0, 2],       // 6: 0110
  [3, 2],       // 7: 0111
  [2, 3],       // 8: 1000
  [2, 0],       // 9: 1001
  [0, 3, 1, 2], // 10: 1010 (ambiguous)
  [2, 1],       // 11: 1011
  [1, 3],       // 12: 1100
  [1, 0],       // 13: 1101
  [0, 3],       // 14: 1110
  []            // 15: 1111
];

// ============================================
// IMAGE METABALL SYSTEM
// ============================================

class ImageMetaballSystem {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.images = Array.from(document.querySelectorAll('.source-img'));

    this.currentImageIndex = 0;
    this.targetImageIndex = 0;

    // Scalar fields for current and target images
    this.currentField = null;
    this.currentColors = null;
    this.targetField = null;
    this.targetColors = null;

    this.isTransitioning = false;
    this.transitionProgress = 0;
    this.transitionStartTime = 0;

    // Animated threshold
    this.threshold = CONFIG.thresholdMin;
    this.thresholdDirection = 1;
    this.time = 0;

    this.mouseX = -1000;
    this.mouseY = -1000;

    // Resize canvas to fill viewport
    this.resizeCanvas();

    // Bind methods
    this.animate = this.animate.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleResize = this.handleResize.bind(this);
    this.handleClick = this.handleClick.bind(this);

    // Setup event listeners
    this.canvas.addEventListener('mousemove', this.handleMouseMove);
    this.canvas.addEventListener('click', this.handleClick);
    this.canvas.addEventListener('mouseleave', () => {
      const indicator = document.getElementById('brushIndicator');
      if (indicator) indicator.style.display = 'none';
    });
    window.addEventListener('resize', this.handleResize);
  }

  resizeCanvas() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;

    // Recalculate grid dimensions
    this.gridWidth = Math.ceil(this.canvas.width / CONFIG.gridResolution);
    this.gridHeight = Math.ceil(this.canvas.height / CONFIG.gridResolution);
  }

  handleMouseMove(e) {
    this.mouseX = e.clientX;
    this.mouseY = e.clientY;
    this.updateBrushIndicator();
  }

  updateBrushIndicator() {
    const indicator = document.getElementById('brushIndicator');
    if (!indicator) return;

    indicator.style.left = this.mouseX + 'px';
    indicator.style.top = this.mouseY + 'px';
    indicator.style.width = (CONFIG.mouseRadius * 2) + 'px';
    indicator.style.height = (CONFIG.mouseRadius * 2) + 'px';
    indicator.style.display = 'block';
  }

  handleClick() {
    this.nextImage();
  }

  handleResize() {
    clearTimeout(this.resizeTimeout);
    this.resizeTimeout = setTimeout(() => {
      this.resizeCanvas();
      const { field, colors } = this.generateScalarField(this.currentImageIndex);
      this.currentField = field;
      this.currentColors = colors;
    }, 300);
  }

  async init() {
    console.log('Initializing Image Metaball System...');

    await ensureTitleFontLoaded();

    // Wait for all images to load
    await Promise.all(this.images.map(img => {
      if (img.complete && img.naturalHeight !== 0) {
        return Promise.resolve();
      }
      return new Promise(resolve => {
        img.addEventListener('load', resolve);
      });
    }));

    // Generate initial scalar field
    const { field, colors } = this.generateScalarField(0);
    this.currentField = field;
    this.currentColors = colors;

    // Start animation loop
    this.animate();

    console.log('Image Metaball System initialized!');
  }

  generateScalarField(imageIndex) {
    const img = this.images[imageIndex];
    if (!img || !img.complete) return { field: null, colors: null };

    console.log(`Generating scalar field for image ${imageIndex}...`);

    // Create scalar field grid
    const field = new Float32Array(this.gridWidth * this.gridHeight);
    const colors = new Array(this.gridWidth * this.gridHeight);

    // Initialize colors array
    for (let i = 0; i < colors.length; i++) {
      colors[i] = { r: 0, g: 0, b: 0, weight: 0 };
    }

    // Create offscreen canvas for pixel sampling
    const offCanvas = document.createElement('canvas');
    const offCtx = offCanvas.getContext('2d', { willReadFrequently: true });

    // Calculate image dimensions to fit viewport
    const imgAspect = img.naturalWidth / img.naturalHeight;
    const viewportAspect = this.canvas.width / this.canvas.height;

    let drawWidth, drawHeight, offsetX, offsetY;

    // Cover fit - fill viewport
    if (viewportAspect > imgAspect) {
      drawWidth = this.canvas.width;
      drawHeight = drawWidth / imgAspect;
      offsetX = 0;
      offsetY = (this.canvas.height - drawHeight) / 2;
    } else {
      drawHeight = this.canvas.height;
      drawWidth = drawHeight * imgAspect;
      offsetX = (this.canvas.width - drawWidth) / 2;
      offsetY = 0;
    }

    // Set canvas size and draw image
    offCanvas.width = drawWidth;
    offCanvas.height = drawHeight;
    offCtx.drawImage(img, 0, 0, drawWidth, drawHeight);

    // Layer 2: composite title into the sampled source
    this.drawTitleOverlay(offCtx, offsetX, offsetY);

    // Get pixel data
    const imageData = offCtx.getImageData(0, 0, drawWidth, drawHeight);
    const pixels = imageData.data;

    // Sample pixels and contribute to scalar field
    const sampleSpacing = Math.max(2, CONFIG.gridResolution); // Sample densely for high detail
    const influenceRadiusSquared = CONFIG.influenceRadius * CONFIG.influenceRadius;

    for (let y = 0; y < drawHeight; y += sampleSpacing) {
      for (let x = 0; x < drawWidth; x += sampleSpacing) {
        const i = (Math.floor(y) * drawWidth + Math.floor(x)) * 4;

        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        const alpha = pixels[i + 3];

        // Skip transparent pixels
        if (alpha < 128) continue;

        // Calculate brightness (0-1)
        const brightness = (r + g + b) / (3 * 255);

        // Pixel position in viewport
        const pixelX = x + offsetX;
        const pixelY = y + offsetY;

        // Grid position
        const gridX = Math.floor(pixelX / CONFIG.gridResolution);
        const gridY = Math.floor(pixelY / CONFIG.gridResolution);

        // Influence radius in grid cells
        const influenceGridRadius = Math.ceil(CONFIG.influenceRadius / CONFIG.gridResolution);

        // Contribute to nearby grid cells
        for (let dy = -influenceGridRadius; dy <= influenceGridRadius; dy++) {
          for (let dx = -influenceGridRadius; dx <= influenceGridRadius; dx++) {
            const targetGridX = gridX + dx;
            const targetGridY = gridY + dy;

            // Check bounds
            if (targetGridX < 0 || targetGridX >= this.gridWidth ||
                targetGridY < 0 || targetGridY >= this.gridHeight) {
              continue;
            }

            // Calculate distance from pixel to grid cell center
            const cellCenterX = targetGridX * CONFIG.gridResolution + CONFIG.gridResolution / 2;
            const cellCenterY = targetGridY * CONFIG.gridResolution + CONFIG.gridResolution / 2;
            const distSq = (pixelX - cellCenterX) ** 2 + (pixelY - cellCenterY) ** 2;

            if (distSq < influenceRadiusSquared) {
              const dist = Math.sqrt(distSq);
              // Falloff function: inverse power law
              const influence = Math.pow(1 - dist / CONFIG.influenceRadius, CONFIG.falloffPower);
              const mass = brightness * influence;

              const idx = targetGridY * this.gridWidth + targetGridX;
              field[idx] += mass;

              // Accumulate weighted color
              colors[idx].r += r * mass;
              colors[idx].g += g * mass;
              colors[idx].b += b * mass;
              colors[idx].weight += mass;
            }
          }
        }
      }
    }

    // Normalize field values and colors
    let maxValue = 0;
    for (let i = 0; i < field.length; i++) {
      if (field[i] > maxValue) maxValue = field[i];
    }

    if (maxValue > 0) {
      for (let i = 0; i < field.length; i++) {
        field[i] /= maxValue;

        // Normalize colors
        if (colors[i].weight > 0) {
          colors[i].r = Math.round(colors[i].r / colors[i].weight);
          colors[i].g = Math.round(colors[i].g / colors[i].weight);
          colors[i].b = Math.round(colors[i].b / colors[i].weight);
        }
      }
    }

    console.log(`Scalar field generated with ${this.gridWidth}x${this.gridHeight} cells`);
    return { field, colors };
  }

  drawTitleOverlay(offCtx, offsetX, offsetY) {
    if (!TITLE.enabled) return;
    const text = (TITLE.text || '').trim();
    if (!text) return;

    // Convert viewport center -> offscreen coordinates
    const centerX = this.canvas.width / 2 - offsetX;
    const centerY = this.canvas.height / 2 - offsetY;

    const minDim = Math.min(this.canvas.width, this.canvas.height);
    const fontSizePx = (minDim * TITLE.sizePercent) / 100;

    offCtx.save();
    offCtx.textAlign = 'center';
    offCtx.textBaseline = 'middle';
    offCtx.font = `${fontSizePx}px ${TITLE_FONT_FAMILY}, sans-serif`;

    if (TITLE.shadowEnabled) {
      offCtx.shadowColor = TITLE.shadowColor;
      offCtx.shadowBlur = TITLE.shadowBlur;
      offCtx.shadowOffsetX = TITLE.shadowOffsetX;
      offCtx.shadowOffsetY = TITLE.shadowOffsetY;
    } else {
      offCtx.shadowColor = 'rgba(0,0,0,0)';
      offCtx.shadowBlur = 0;
      offCtx.shadowOffsetX = 0;
      offCtx.shadowOffsetY = 0;
    }

    offCtx.lineJoin = 'round';
    offCtx.miterLimit = 2;

    if (TITLE.strokeWidth > 0) {
      offCtx.strokeStyle = TITLE.strokeColor;
      offCtx.lineWidth = TITLE.strokeWidth;
      offCtx.strokeText(text, centerX, centerY);
    }

    offCtx.fillStyle = TITLE.fillColor;
    offCtx.fillText(text, centerX, centerY);

    offCtx.restore();
  }

  transitionToImage(newIndex) {
    if (newIndex === this.targetImageIndex && this.isTransitioning) {
      return;
    }

    if (this.isTransitioning) {
      this.currentField = this.targetField;
      this.currentColors = this.targetColors;
      this.currentImageIndex = this.targetImageIndex;
    }

    this.targetImageIndex = newIndex;
    const { field, colors } = this.generateScalarField(newIndex);
    this.targetField = field;
    this.targetColors = colors;

    this.isTransitioning = true;
    this.transitionProgress = 0;
    this.transitionStartTime = performance.now();

    console.log(`Transitioning from image ${this.currentImageIndex} to ${this.targetImageIndex}`);
  }

  animate() {
    this.time++;

    // Update base threshold using Perlin noise for organic, endlessly varied animation
    const baseThreshold = (CONFIG.thresholdMin + CONFIG.thresholdMax) / 2;
    const thresholdRange = (CONFIG.thresholdMax - CONFIG.thresholdMin) / 2;

    // Use 1D Perlin noise in time dimension for smooth, non-repeating oscillation
    const noiseValue = perlinNoise.noise(this.time * CONFIG.thresholdSpeed, 0, 0);
    this.threshold = baseThreshold + noiseValue * thresholdRange;

    // Clear canvas
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    let activeField, activeColors;

    if (this.isTransitioning) {
      // Calculate transition progress
      const elapsed = performance.now() - this.transitionStartTime;
      this.transitionProgress = Math.min(elapsed / CONFIG.transitionDuration, 1);

      // Ease function
      const eased = this.easeInOutCubic(this.transitionProgress);

      // Interpolate between fields
      const blendedField = new Float32Array(this.gridWidth * this.gridHeight);
      const blendedColors = new Array(this.gridWidth * this.gridHeight);

      for (let i = 0; i < blendedField.length; i++) {
        blendedField[i] = this.currentField[i] + (this.targetField[i] - this.currentField[i]) * eased;

        blendedColors[i] = {
          r: Math.round(this.currentColors[i].r + (this.targetColors[i].r - this.currentColors[i].r) * eased),
          g: Math.round(this.currentColors[i].g + (this.targetColors[i].g - this.currentColors[i].g) * eased),
          b: Math.round(this.currentColors[i].b + (this.targetColors[i].b - this.currentColors[i].b) * eased),
        };
      }

      activeField = blendedField;
      activeColors = blendedColors;

      // Check if transition complete
      if (this.transitionProgress >= 1) {
        this.currentField = this.targetField;
        this.currentColors = this.targetColors;
        this.currentImageIndex = this.targetImageIndex;
        this.isTransitioning = false;
        console.log('Transition complete');
      }
    } else {
      activeField = this.currentField;
      activeColors = this.currentColors;
    }

    // Apply mouse influence to threshold
    const mouseGridX = Math.floor(this.mouseX / CONFIG.gridResolution);
    const mouseGridY = Math.floor(this.mouseY / CONFIG.gridResolution);
    const mouseInfluenceRadius = Math.ceil(CONFIG.mouseRadius / CONFIG.gridResolution);

    // Render using marching squares
    this.renderMarchingSquares(activeField, activeColors, mouseGridX, mouseGridY, mouseInfluenceRadius);

    requestAnimationFrame(this.animate);
  }

  renderMarchingSquares(field, colors, mouseGridX, mouseGridY, mouseInfluenceRadius) {
    for (let y = 0; y < this.gridHeight - 1; y++) {
      for (let x = 0; x < this.gridWidth - 1; x++) {
        // Get corner values
        const idx00 = y * this.gridWidth + x;
        const idx10 = y * this.gridWidth + (x + 1);
        const idx01 = (y + 1) * this.gridWidth + x;
        const idx11 = (y + 1) * this.gridWidth + (x + 1);

        const v00 = field[idx00];
        const v10 = field[idx10];
        const v01 = field[idx01];
        const v11 = field[idx11];

        // Calculate local threshold with Perlin noise and mouse influence
        let localThreshold = this.threshold;

        // Add spatial and temporal Perlin noise variation
        const noiseValue = perlinNoise.noise(
          x * CONFIG.noiseScale,
          y * CONFIG.noiseScale,
          this.time * CONFIG.noiseSpeed
        );
        // Map noise from [-1, 1] to [-noiseStrength, noiseStrength]
        localThreshold += noiseValue * CONFIG.noiseStrength;

        // Add mouse influence
        const dx = x - mouseGridX;
        const dy = y - mouseGridY;
        const distSq = dx * dx + dy * dy;

        if (distSq < mouseInfluenceRadius * mouseInfluenceRadius) {
          const dist = Math.sqrt(distSq);
          const influence = 1 - dist / mouseInfluenceRadius;
          localThreshold += influence * CONFIG.mouseStrength;
        }

        // Determine cell configuration
        let cellIndex = 0;
        if (v00 > localThreshold) cellIndex |= 1;
        if (v10 > localThreshold) cellIndex |= 2;
        if (v11 > localThreshold) cellIndex |= 4;
        if (v01 > localThreshold) cellIndex |= 8;

        // Get edges to draw
        const edges = EDGE_TABLE[cellIndex];
        if (edges.length === 0) continue;

        // Calculate edge positions using linear interpolation
        const x0 = x * CONFIG.gridResolution;
        const y0 = y * CONFIG.gridResolution;
        const x1 = (x + 1) * CONFIG.gridResolution;
        const y1 = (y + 1) * CONFIG.gridResolution;

        const edgePoints = [
          this.interpolateEdge(x0, y0, x1, y0, v00, v10, localThreshold), // Top
          this.interpolateEdge(x1, y0, x1, y1, v10, v11, localThreshold), // Right
          this.interpolateEdge(x0, y1, x1, y1, v01, v11, localThreshold), // Bottom
          this.interpolateEdge(x0, y0, x0, y1, v00, v01, localThreshold)  // Left
        ];

        // Get cell color (average of corners)
        const cellColor = {
          r: Math.round((colors[idx00].r + colors[idx10].r + colors[idx01].r + colors[idx11].r) / 4),
          g: Math.round((colors[idx00].g + colors[idx10].g + colors[idx01].g + colors[idx11].g) / 4),
          b: Math.round((colors[idx00].b + colors[idx10].b + colors[idx01].b + colors[idx11].b) / 4),
        };

        // Draw lines
        this.ctx.strokeStyle = `rgb(${cellColor.r}, ${cellColor.g}, ${cellColor.b})`;
        this.ctx.lineWidth = CONFIG.lineWidth;
        this.ctx.lineCap = 'round';

        for (let i = 0; i < edges.length; i += 2) {
          const p1 = edgePoints[edges[i]];
          const p2 = edgePoints[edges[i + 1]];

          this.ctx.beginPath();
          this.ctx.moveTo(p1.x, p1.y);
          this.ctx.lineTo(p2.x, p2.y);
          this.ctx.stroke();
        }
      }
    }
  }

  interpolateEdge(x1, y1, x2, y2, v1, v2, threshold) {
    // Linear interpolation to find where threshold crosses the edge
    let t = 0.5; // Default to midpoint

    if (Math.abs(v2 - v1) > 0.001) {
      t = (threshold - v1) / (v2 - v1);
      t = Math.max(0, Math.min(1, t)); // Clamp to [0, 1]
    }

    return {
      x: x1 + (x2 - x1) * t,
      y: y1 + (y2 - y1) * t
    };
  }

  easeInOutCubic(t) {
    return t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  nextImage() {
    const nextIndex = (this.targetImageIndex + 1) % this.images.length;
    this.transitionToImage(nextIndex);
    updateImageName(nextIndex);
  }

  previousImage() {
    const prevIndex = (this.targetImageIndex - 1 + this.images.length) % this.images.length;
    this.transitionToImage(prevIndex);
    updateImageName(prevIndex);
  }

  // Helper to regenerate scalar fields (needed when detail parameters change)
  regenerateFields() {
    this.resizeCanvas();
    const { field, colors } = this.generateScalarField(this.currentImageIndex);
    this.currentField = field;
    this.currentColors = colors;

    if (this.isTransitioning) {
      const { field: targetField, colors: targetColors } = this.generateScalarField(this.targetImageIndex);
      this.targetField = targetField;
      this.targetColors = targetColors;
    }
  }

  // Parameter setters
  setGridResolution(value) {
    CONFIG.gridResolution = parseFloat(value);
    this.regenerateFields();
  }

  setInfluenceRadius(value) {
    CONFIG.influenceRadius = parseFloat(value);
    this.regenerateFields();
  }

  setFalloffPower(value) {
    CONFIG.falloffPower = parseFloat(value);
    this.regenerateFields();
  }

  setLineWidth(value) {
    CONFIG.lineWidth = parseFloat(value);
  }

  setThresholdSpeed(value) {
    CONFIG.thresholdSpeed = parseFloat(value);
  }

  setNoiseSpeed(value) {
    CONFIG.noiseSpeed = parseFloat(value);
  }

  setThresholdMin(value) {
    CONFIG.thresholdMin = parseFloat(value);
  }

  setThresholdMax(value) {
    CONFIG.thresholdMax = parseFloat(value);
  }

  setNoiseScale(value) {
    CONFIG.noiseScale = parseFloat(value);
  }

  setNoiseStrength(value) {
    CONFIG.noiseStrength = parseFloat(value);
  }

  setMouseRadius(value) {
    CONFIG.mouseRadius = parseFloat(value);
    this.updateBrushIndicator();
  }

  setMouseStrength(value) {
    CONFIG.mouseStrength = parseFloat(value);
  }

  setTransitionDuration(value) {
    CONFIG.transitionDuration = parseFloat(value);
  }

  // Title setters
  setTitleText(value) {
    TITLE.text = String(value ?? '');
    this.regenerateFields();
  }

  setTitleEnabled(value) {
    TITLE.enabled = Boolean(value);
    this.regenerateFields();
  }

  setTitleSizePercent(value) {
    TITLE.sizePercent = Math.max(0, parseFloat(value));
    this.regenerateFields();
  }

  setTitleFillColor(value) {
    TITLE.fillColor = String(value);
    this.regenerateFields();
  }

  setTitleStrokeColor(value) {
    TITLE.strokeColor = String(value);
    this.regenerateFields();
  }

  setTitleStrokeWidth(value) {
    TITLE.strokeWidth = Math.max(0, parseFloat(value));
    this.regenerateFields();
  }

  setTitleShadowEnabled(value) {
    TITLE.shadowEnabled = Boolean(value);
    this.regenerateFields();
  }

  setTitleShadowColor(value) {
    TITLE.shadowColor = String(value);
    this.regenerateFields();
  }

  setTitleShadowBlur(value) {
    TITLE.shadowBlur = Math.max(0, parseFloat(value));
    this.regenerateFields();
  }

  setTitleShadowOffsetX(value) {
    TITLE.shadowOffsetX = parseFloat(value);
    this.regenerateFields();
  }

  setTitleShadowOffsetY(value) {
    TITLE.shadowOffsetY = parseFloat(value);
    this.regenerateFields();
  }
}

// ============================================
// UI CONTROLS
// ============================================

function updateImageName(index) {
  const imageNameDisplay = document.getElementById('imageName');
  imageNameDisplay.textContent = THUMBNAIL_IMAGES[index];
}

// ============================================
// INITIALIZATION
// ============================================

let metaballSystem;

document.addEventListener('DOMContentLoaded', () => {
  // Populate hidden images
  populateHiddenImages();

  // Set initial image name
  updateImageName(0);

  // Initialize metaball system after images load
  window.addEventListener('load', async () => {
    const canvas = document.getElementById('canvas');
    metaballSystem = new ImageMetaballSystem(canvas);
    await metaballSystem.init();

    // Setup button controls
    document.getElementById('prevBtn').addEventListener('click', () => {
      metaballSystem.previousImage();
    });

    document.getElementById('nextBtn').addEventListener('click', () => {
      metaballSystem.nextImage();
    });

    // Keyboard controls
    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') {
        metaballSystem.previousImage();
      } else if (e.key === 'ArrowRight') {
        metaballSystem.nextImage();
      }
    });

    // Toggle controls panel
    const toggleBtn = document.getElementById('toggleControls');
    const controlsContent = document.getElementById('controlsContent');

    toggleBtn.addEventListener('click', () => {
      controlsContent.classList.toggle('collapsed');
      toggleBtn.textContent = controlsContent.classList.contains('collapsed') ? '+' : '−';
    });

    // Toggle title controls panel
    const toggleTitleBtn = document.getElementById('toggleTitleControls');
    const titleControlsContent = document.getElementById('titleControlsContent');

    toggleTitleBtn.addEventListener('click', () => {
      titleControlsContent.classList.toggle('collapsed');
      toggleTitleBtn.textContent = titleControlsContent.classList.contains('collapsed') ? '+' : '−';
    });

    // Helper to setup slider
    function setupSlider(id, valueId, setter, decimals = 0) {
      const slider = document.getElementById(id);
      const valueDisplay = document.getElementById(valueId);

      slider.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        valueDisplay.textContent = decimals > 0 ? value.toFixed(decimals) : value;
        setter.call(metaballSystem, value);
      });
    }

    // Detail & Rendering sliders
    setupSlider('gridResolutionSlider', 'gridResolutionValue', metaballSystem.setGridResolution, 1);
    setupSlider('influenceRadiusSlider', 'influenceRadiusValue', metaballSystem.setInfluenceRadius, 0);
    setupSlider('falloffPowerSlider', 'falloffPowerValue', metaballSystem.setFalloffPower, 1);
    setupSlider('lineWidthSlider', 'lineWidthValue', metaballSystem.setLineWidth, 1);

    // Animation Speed sliders
    setupSlider('thresholdSpeedSlider', 'thresholdSpeedValue', metaballSystem.setThresholdSpeed, 4);
    setupSlider('noiseSpeedSlider', 'noiseSpeedValue', metaballSystem.setNoiseSpeed, 5);

    // Threshold Range sliders
    setupSlider('thresholdMinSlider', 'thresholdMinValue', metaballSystem.setThresholdMin, 2);
    setupSlider('thresholdMaxSlider', 'thresholdMaxValue', metaballSystem.setThresholdMax, 2);

    // Noise Settings sliders
    setupSlider('noiseScaleSlider', 'noiseScaleValue', metaballSystem.setNoiseScale, 4);
    setupSlider('noiseStrengthSlider', 'noiseStrengthValue', metaballSystem.setNoiseStrength, 2);

    // Mouse Interaction sliders
    setupSlider('mouseRadiusSlider', 'mouseRadiusValue', metaballSystem.setMouseRadius, 0);
    setupSlider('mouseStrengthSlider', 'mouseStrengthValue', metaballSystem.setMouseStrength, 2);

    // Other sliders
    setupSlider('transitionDurationSlider', 'transitionDurationValue', metaballSystem.setTransitionDuration, 0);

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

    // Initialize UI from defaults
    titleTextInput.value = TITLE.text;
    titleShowToggle.checked = TITLE.enabled;
    titleSizeSlider.value = String(TITLE.sizePercent);
    titleSizeValue.textContent = Number(TITLE.sizePercent).toFixed(1);
    titleFillColor.value = TITLE.fillColor;
    titleStrokeColor.value = TITLE.strokeColor;
    titleStrokeWidthSlider.value = String(TITLE.strokeWidth);
    titleStrokeWidthValue.textContent = Number(TITLE.strokeWidth).toFixed(1);
    titleShadowToggle.checked = TITLE.shadowEnabled;
    titleShadowColor.value = TITLE.shadowColor;
    titleShadowBlurSlider.value = String(TITLE.shadowBlur);
    titleShadowBlurValue.textContent = String(Math.round(TITLE.shadowBlur));
    titleShadowOffsetXSlider.value = String(TITLE.shadowOffsetX);
    titleShadowOffsetXValue.textContent = String(Math.round(TITLE.shadowOffsetX));
    titleShadowOffsetYSlider.value = String(TITLE.shadowOffsetY);
    titleShadowOffsetYValue.textContent = String(Math.round(TITLE.shadowOffsetY));

    titleTextInput.addEventListener('input', (e) => {
      metaballSystem.setTitleText(e.target.value);
    });

    titleShowToggle.addEventListener('change', (e) => {
      metaballSystem.setTitleEnabled(e.target.checked);
    });

    // Slider-only bindings (same UI pattern as effect controls)
    titleSizeSlider.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      if (Number.isNaN(value)) return;
      titleSizeValue.textContent = value.toFixed(1);
      metaballSystem.setTitleSizePercent(value);
    });

    titleStrokeWidthSlider.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      if (Number.isNaN(value)) return;
      titleStrokeWidthValue.textContent = value.toFixed(1);
      metaballSystem.setTitleStrokeWidth(value);
    });

    titleShadowBlurSlider.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      if (Number.isNaN(value)) return;
      titleShadowBlurValue.textContent = String(Math.round(value));
      metaballSystem.setTitleShadowBlur(value);
    });

    titleShadowOffsetXSlider.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      if (Number.isNaN(value)) return;
      titleShadowOffsetXValue.textContent = String(Math.round(value));
      metaballSystem.setTitleShadowOffsetX(value);
    });

    titleShadowOffsetYSlider.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      if (Number.isNaN(value)) return;
      titleShadowOffsetYValue.textContent = String(Math.round(value));
      metaballSystem.setTitleShadowOffsetY(value);
    });

    titleFillColor.addEventListener('input', (e) => {
      metaballSystem.setTitleFillColor(e.target.value);
    });

    titleStrokeColor.addEventListener('input', (e) => {
      metaballSystem.setTitleStrokeColor(e.target.value);
    });

    titleShadowToggle.addEventListener('change', (e) => {
      metaballSystem.setTitleShadowEnabled(e.target.checked);
    });

    titleShadowColor.addEventListener('input', (e) => {
      metaballSystem.setTitleShadowColor(e.target.value);
    });
  });
});
