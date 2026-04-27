/* =====================================================
   CUTE PHOTOBOOTH — app.js
   ===================================================== */

'use strict';

// ── State ──────────────────────────────────────────
const state = {
  stream: null,
  photos: [],          // array of ImageData/dataURLs
  currentFilter: 'none',
  currentFrame: 'kawaii',
  photoCount: 3,
  timerDelay: 3,
  mirror: true,
  capturing: false,
  facingMode: 'user', // 'user' for front, 'environment' for back
  stripLayout: 'vertical' // 'vertical' or 'horizontal'
};

// ── DOM Refs ────────────────────────────────────────
const video          = document.getElementById('videoFeed');
const hiddenCanvas   = document.getElementById('hiddenCanvas');
const stripCanvas    = document.getElementById('stripCanvas');
const countdownOverlay = document.getElementById('countdownOverlay');
const countdownNumber  = document.getElementById('countdownNumber');
const flashEffect    = document.getElementById('flashEffect');
const shutterBtn     = document.getElementById('shutterBtn');
const retakeBtn      = document.getElementById('retakeBtn');
const downloadBtn    = document.getElementById('downloadBtn');
const printBtn       = document.getElementById('printBtn');
const stripActions   = document.getElementById('stripActions');
const emptyStrip     = document.getElementById('emptyStrip');
const mirrorToggle   = document.getElementById('mirrorToggle');
const mirrorBadge    = document.getElementById('mirrorBadge');
const camWarning     = document.getElementById('camWarning');
const retryCamBtn    = document.getElementById('retryCamBtn');
const toastMsg       = document.getElementById('toastMsg');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingText    = document.getElementById('loadingText');
const printContainer = document.getElementById('printContainer');
const frameOverlay   = document.getElementById('frameOverlay');
const faceOverlay    = document.getElementById('faceOverlay');
const switchCamBtn   = document.getElementById('switchCamBtn');
const layoutToggle   = document.getElementById('layoutToggle');

const customPhotoCount = document.getElementById('customPhotoCount');
const customTimerDelay = document.getElementById('customTimerDelay');

// ── Init ────────────────────────────────────────────
(async function init() {
  try {
    showLoading('Menyiapkan AI Data Wajah... 🤖');
    // Jika dijalankan langsung dari file:// (tanpa server lokal), gunakan proxy CORS agar tidak diblokir browser.
    const MODEL_URL = window.location.protocol === 'file:' 
      ? 'https://my-cors-proxy.zenth.workers.dev/?url=https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights'
      : './assets/models';
      
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
  } catch (err) {
    console.error('Gagal memuat model AI wajah:', err);
  }
  
  showLoading('Mempersiapkan kamera... 📸');
  await startCamera();
  hideLoading();
  bindEvents();
})();

// ── Camera ──────────────────────────────────────────
async function startCamera() {
  try {
    let constraints = {
      video: {
        width:  { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: state.facingMode
      },
      audio: false,
    };
    try {
      state.stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (e) {
      console.warn("Kamera resolusi tinggi gagal, mencoba pengaturan standar...", e);
      constraints = { video: { facingMode: state.facingMode }, audio: false };
      state.stream = await navigator.mediaDevices.getUserMedia(constraints);
    }
    video.srcObject = state.stream;
    await new Promise(res => { video.onloadedmetadata = res; });
    video.play();
    camWarning.style.display = 'none';
  } catch (err) {
    console.error('Camera error:', err);
    camWarning.style.display = 'flex';
    
    const warningText = camWarning.querySelector('p');
    if (warningText) {
      if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        showToast('⚠️ Kamera sedang dipakai aplikasi lain!');
        warningText.innerHTML = 'Kamera tidak bisa diakses karena <b>sedang digunakan oleh aplikasi lain</b> (seperti Zoom/Meet). Tutup aplikasi tersebut dan coba lagi.';
      } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        showToast('⚠️ Izin kamera ditolak!');
        warningText.innerHTML = '⚠️ Izin kamera ditolak. Pastikan kamu <b>mengizinkan (allow)</b> akses kamera di pengaturan browser!';
      } else {
        showToast('⚠️ Kamera tidak bisa diakses!');
        warningText.innerHTML = '⚠️ Kamera tidak dapat diakses. Pastikan kamera terhubung dengan benar!';
      }
    } else {
      showToast('⚠️ Kamera tidak bisa diakses!');
    }
  }
}

function stopCamera() {
  if (state.stream) {
    state.stream.getTracks().forEach(t => t.stop());
    state.stream = null;
  }
}

// ── Events ──────────────────────────────────────────
let faceDetectionInterval;

function bindEvents() {
  // Face Detection on Video Play
  video.addEventListener('play', () => {
    const displaySize = { width: video.videoWidth || 1280, height: video.videoHeight || 720 };
    faceOverlay.width = displaySize.width;
    faceOverlay.height = displaySize.height;
    
    if (typeof faceapi !== 'undefined') {
      faceapi.matchDimensions(faceOverlay, displaySize);

      let isDetecting = false;
      
      async function detectLoop() {
        if (video.paused || video.ended) return;
        
        if (!state.capturing && !isDetecting) {
          isDetecting = true;
          try {
            // Lower inputSize for significantly better performance on mobile (default is 416)
            const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });
            const detections = await faceapi.detectAllFaces(video, options);
            const resizedDetections = faceapi.resizeResults(detections, displaySize);

            const ctx = faceOverlay.getContext('2d');
            ctx.clearRect(0, 0, faceOverlay.width, faceOverlay.height);

            resizedDetections.forEach(detection => {
              const box = detection.box;
              let drawX = box.x;
              if (state.mirror) {
                drawX = faceOverlay.width - box.x - box.width;
              }

              ctx.strokeStyle = '#ff6eb4';
              ctx.lineWidth = 4;
              ctx.setLineDash([8, 6]);
              ctx.strokeRect(drawX, box.y, box.width, box.height);
              ctx.setLineDash([]);
              
              ctx.fillStyle = '#ff6eb4';
              ctx.font = 'bold 18px Nunito';
              ctx.fillText('✨ Cute Face ✨', drawX, box.y - 10);
            });
          } catch (err) {
            // ignore errors
          }
          isDetecting = false;
        }

        // Request next frame delay (approx 150ms to save battery and reduce lag)
        setTimeout(() => requestAnimationFrame(detectLoop), 150);
      }

      // Start loop
      detectLoop();
    }
  });

  // Shutter
  shutterBtn.addEventListener('click', startCapture);

  // Retake
  retakeBtn.addEventListener('click', () => {
    state.photos = [];
    stripCanvas.style.display = 'none';
    emptyStrip.style.display = 'flex';
    stripActions.style.display = 'none';
    shutterBtn.disabled = false;
    showToast('🔄 Siap ambil foto baru!');
  });

  // Download
  downloadBtn.addEventListener('click', downloadStrip);

  // Print
  printBtn.addEventListener('click', printStrip);

  // Mirror toggle
  mirrorToggle.addEventListener('change', () => {
    state.mirror = mirrorToggle.checked;
    video.classList.toggle('mirror-off', !state.mirror);
    mirrorBadge.style.opacity = state.mirror ? '1' : '0.35';
  });

  // Switch Camera
  switchCamBtn.addEventListener('click', async () => {
    state.facingMode = state.facingMode === 'user' ? 'environment' : 'user';
    stopCamera();
    
    // Auto-disable mirror if using back camera
    state.mirror = state.facingMode === 'user';
    mirrorToggle.checked = state.mirror;
    video.classList.toggle('mirror-off', !state.mirror);
    mirrorBadge.style.opacity = state.mirror ? '1' : '0.35';

    showLoading('Mengganti kamera... 📸');
    await startCamera();
    hideLoading();
  });

  // Strip Layout Toggle
  layoutToggle.addEventListener('change', () => {
    state.stripLayout = layoutToggle.checked ? 'horizontal' : 'vertical';
    if (state.photos.length > 0) renderStrip();
  });

  // Retry camera
  retryCamBtn.addEventListener('click', async () => {
    showLoading('Mencoba ulang kamera...');
    await startCamera();
    hideLoading();
  });

  // Filter pills
  document.getElementById('filterPills').addEventListener('click', e => {
    const btn = e.target.closest('.pill');
    if (!btn || btn.tagName !== 'BUTTON') return;
    state.currentFilter = btn.dataset.filter;
    document.querySelectorAll('#filterPills .pill').forEach(p => {
      p.classList.toggle('active', p === btn);
      if (p.tagName === 'BUTTON') p.setAttribute('aria-selected', p === btn ? 'true' : 'false');
    });
    applyVideoFilter(state.currentFilter);
  });

  // Photo count pills
  document.getElementById('countPills').addEventListener('click', e => {
    const btn = e.target.closest('button.pill');
    if (!btn) return;
    state.photoCount = parseInt(btn.dataset.count);
    customPhotoCount.value = ''; // clear custom input
    document.querySelectorAll('#countPills button.pill').forEach(p => {
      p.classList.toggle('active', p === btn);
      p.setAttribute('aria-selected', p === btn ? 'true' : 'false');
    });
  });

  // Custom Photo Count Input
  customPhotoCount.addEventListener('input', (e) => {
    let val = parseInt(e.target.value);
    if (isNaN(val)) return;
    if (val < 1) val = 1;
    if (val > 20) val = 20;
    state.photoCount = val;
    // Remove active state from preset buttons
    document.querySelectorAll('#countPills button.pill').forEach(p => {
      p.classList.remove('active');
      p.setAttribute('aria-selected', 'false');
    });
  });
  customPhotoCount.addEventListener('change', (e) => {
      let val = parseInt(e.target.value);
      if (isNaN(val) || val < 1) {
          e.target.value = 1;
          state.photoCount = 1;
      } else if (val > 20) {
          e.target.value = 20;
          state.photoCount = 20;
      }
  });


  // Timer pills
  document.getElementById('timerPills').addEventListener('click', e => {
    const btn = e.target.closest('button.pill');
    if (!btn) return;
    state.timerDelay = parseInt(btn.dataset.timer);
    customTimerDelay.value = ''; // clear custom input
    document.querySelectorAll('#timerPills button.pill').forEach(p => {
      p.classList.toggle('active', p === btn);
      p.setAttribute('aria-selected', p === btn ? 'true' : 'false');
    });
  });

  // Custom Timer Input
  customTimerDelay.addEventListener('input', (e) => {
    let val = parseInt(e.target.value);
    if (isNaN(val)) return;
    if (val < 0) val = 0;
    if (val > 60) val = 60;
    state.timerDelay = val;
    // Remove active state from preset buttons
    document.querySelectorAll('#timerPills button.pill').forEach(p => {
      p.classList.remove('active');
      p.setAttribute('aria-selected', 'false');
    });
  });
  customTimerDelay.addEventListener('change', (e) => {
      let val = parseInt(e.target.value);
      if (isNaN(val) || val < 0) {
          e.target.value = 0;
          state.timerDelay = 0;
      } else if (val > 60) {
          e.target.value = 60;
          state.timerDelay = 60;
      }
  });

  // Frame grid
  document.getElementById('frameGrid').addEventListener('click', e => {
    const btn = e.target.closest('.frame-option');
    if (!btn) return;
    state.currentFrame = btn.dataset.frame;
    document.querySelectorAll('.frame-option').forEach(f => {
      f.classList.toggle('active', f === btn);
      f.setAttribute('aria-selected', f === btn ? 'true' : 'false');
    });
    // Re-render strip if photos exist
    if (state.photos.length > 0) renderStrip();
  });
}

// ── Video Filter ─────────────────────────────────────
function applyVideoFilter(filter) {
  video.className = video.classList.contains('mirror-off') ? 'mirror-off' : '';
  if (filter !== 'none') video.classList.add(`filter-${filter}`);
}

// ── Capture Flow ─────────────────────────────────────
async function startCapture() {
  if (state.capturing) return;
  state.capturing = true;
  shutterBtn.disabled = true;
  state.photos = [];
  showToast(`📸 Akan mengambil ${state.photoCount} foto!`);

  for (let i = 0; i < state.photoCount; i++) {
    if (state.timerDelay > 0) await countdown(state.timerDelay);
    await captureOnePhoto(i + 1);
    if (i < state.photoCount - 1) await sleep(600);
  }

  await renderStrip();
  state.capturing = false;
  stripCanvas.style.display = 'block';
  emptyStrip.style.display = 'none';
  stripActions.style.display = 'flex';
  showToast('🎉 Strip foto siap!');
}

async function countdown(seconds) {
  return new Promise(resolve => {
    countdownOverlay.classList.add('active');
    let remaining = seconds;

    const tick = () => {
      if (remaining <= 0) {
        countdownOverlay.classList.remove('active');
        countdownNumber.textContent = '';
        resolve();
        return;
      }
      countdownNumber.textContent = remaining === 1 ? '😄' : remaining;
      // Re-trigger animation
      countdownNumber.style.animation = 'none';
      void countdownNumber.offsetWidth;
      countdownNumber.style.animation = '';
      remaining--;
      setTimeout(tick, 1000);
    };
    tick();
  });
}

async function captureOnePhoto(index) {
  return new Promise(resolve => {
    const w = video.videoWidth  || 1280;
    const h = video.videoHeight || 720;
    hiddenCanvas.width  = w;
    hiddenCanvas.height = h;
    const ctx = hiddenCanvas.getContext('2d');

    // Mirror
    if (state.mirror) {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }

    // Draw video frame
    ctx.drawImage(video, 0, 0, w, h);

    // Reset transform
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Apply canvas filter
    applyCanvasFilter(ctx, w, h, state.currentFilter);

    const dataURL = hiddenCanvas.toDataURL('image/png', 1.0);
    state.photos.push(dataURL);

    // Flash!
    flashEffect.classList.add('flashing');
    setTimeout(() => flashEffect.classList.remove('flashing'), 600);

    showToast(`✅ Foto ${index} diambil!`);
    setTimeout(resolve, 300);
  });
}

// ── Canvas Filters ───────────────────────────────────
function applyCanvasFilter(ctx, w, h, filter) {
  if (filter === 'none') return;
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i], g = data[i+1], b = data[i+2];
    switch (filter) {
      case 'grayscale': {
        const gray = r*0.299 + g*0.587 + b*0.114;
        data[i] = data[i+1] = data[i+2] = gray;
        break;
      }
      case 'sepia': {
        data[i]   = Math.min(255, r*0.393 + g*0.769 + b*0.189);
        data[i+1] = Math.min(255, r*0.349 + g*0.686 + b*0.168);
        data[i+2] = Math.min(255, r*0.272 + g*0.534 + b*0.131);
        break;
      }
      case 'warm': {
        data[i]   = Math.min(255, r * 1.15);
        data[i+1] = Math.min(255, g * 1.05);
        data[i+2] = Math.min(255, b * 0.85);
        break;
      }
      case 'cool': {
        data[i]   = Math.min(255, r * 0.88);
        data[i+1] = Math.min(255, g * 0.95);
        data[i+2] = Math.min(255, b * 1.18);
        break;
      }
      case 'vivid': {
        const avg = (r + g + b) / 3;
        data[i]   = Math.min(255, avg + (r - avg) * 1.7);
        data[i+1] = Math.min(255, avg + (g - avg) * 1.7);
        data[i+2] = Math.min(255, avg + (b - avg) * 1.7);
        break;
      }
      case 'dreamy': {
        data[i]   = Math.min(255, r * 1.1 + 10);
        data[i+1] = Math.min(255, g * 1.05 + 8);
        data[i+2] = Math.min(255, b * 1.12 + 15);
        break;
      }
      case 'neon': {
        data[i]   = Math.min(255, r * 1.2);
        data[i+1] = Math.min(255, g * 0.8);
        data[i+2] = Math.min(255, b * 1.5);
        break;
      }
      case 'pastel': {
        data[i]   = Math.min(255, r * 0.9 + 20);
        data[i+1] = Math.min(255, g * 0.9 + 20);
        data[i+2] = Math.min(255, b * 0.9 + 20);
        break;
      }
      case 'cinema': {
        data[i]   = Math.min(255, r * 1.1);
        data[i+1] = Math.min(255, g * 1.0);
        data[i+2] = Math.min(255, b * 0.9);
        break;
      }
      case 'retro-pop': {
        data[i]   = Math.min(255, r * 1.3);
        data[i+1] = Math.min(255, g * 1.1);
        data[i+2] = Math.min(255, b * 0.8);
        break;
      }
      case 'cyberpunk': {
        data[i]   = Math.min(255, r * 1.5);
        data[i+1] = Math.min(255, g * 0.5);
        data[i+2] = Math.min(255, b * 1.5);
        break;
      }
      case 'polaroid': {
        data[i]   = Math.min(255, r * 1.1 + 10);
        data[i+1] = Math.min(255, g * 1.0 + 5);
        data[i+2] = Math.min(255, b * 0.9);
        break;
      }
      case 'noir': {
        const gray = r*0.3 + g*0.59 + b*0.11;
        const contrast = (gray - 128) * 1.5 + 128;
        data[i] = data[i+1] = data[i+2] = Math.min(255, Math.max(0, contrast));
        break;
      }
      case 'golden': {
        data[i]   = Math.min(255, r * 1.2);
        data[i+1] = Math.min(255, g * 1.1);
        data[i+2] = Math.min(255, b * 0.8);
        break;
      }
      case 'emerald': {
        data[i]   = Math.min(255, r * 0.8);
        data[i+1] = Math.min(255, g * 1.3);
        data[i+2] = Math.min(255, b * 0.9);
        break;
      }
      case 'twilight': {
        data[i]   = Math.min(255, r * 0.9);
        data[i+1] = Math.min(255, g * 0.8);
        data[i+2] = Math.min(255, b * 1.3);
        break;
      }
      case 'acid': {
        data[i]   = 255 - r;
        data[i+1] = 255 - b;
        data[i+2] = 255 - g;
        break;
      }
      case 'matrix': {
        data[i]   = Math.min(255, r * 0.2);
        data[i+1] = Math.min(255, g * 1.8);
        data[i+2] = Math.min(255, b * 0.2);
        break;
      }
      case 'romance': {
        data[i]   = Math.min(255, r * 1.2 + 20);
        data[i+1] = Math.min(255, g * 0.9 + 10);
        data[i+2] = Math.min(255, b * 1.0 + 10);
        break;
      }
      case 'horror': {
        const gray = r*0.3 + g*0.59 + b*0.11;
        data[i]   = Math.min(255, gray * 0.5 + 30);
        data[i+1] = Math.min(255, gray * 0.2);
        data[i+2] = Math.min(255, gray * 0.2);
        break;
      }
      case 'suspense': {
        data[i]   = Math.min(255, r * 0.6);
        data[i+1] = Math.min(255, g * 1.1 + 10);
        data[i+2] = Math.min(255, b * 1.2 + 20);
        break;
      }
      case 'pro': {
        const contrast = 1.2;
        data[i]   = Math.min(255, ((r / 255 - 0.5) * contrast + 0.5) * 255 * 1.05);
        data[i+1] = Math.min(255, ((g / 255 - 0.5) * contrast + 0.5) * 255 * 1.05);
        data[i+2] = Math.min(255, ((b / 255 - 0.5) * contrast + 0.5) * 255 * 1.05);
        break;
      }
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

// ── Strip Rendering ───────────────────────────────────
async function renderStrip() {
  const count = state.photos.length;
  if (count === 0) return;

  const PHOTO_W = 600;
  const PHOTO_H = Math.round(PHOTO_W * 0.75);   // 4:3
  const PAD     = 28;
  const HEADER  = 80;
  const FOOTER  = 90;

  let TOTAL_W, TOTAL_H;

  if (state.stripLayout === 'horizontal') {
    TOTAL_W = PAD * 2 + (PHOTO_W * count) + (PAD * (count - 1));
    TOTAL_H = HEADER + PHOTO_H + PAD * 2 + FOOTER;
  } else {
    TOTAL_W = PHOTO_W + PAD * 2;
    TOTAL_H = HEADER + count * PHOTO_H + (count - 1) * PAD + PAD * 2 + FOOTER;
  }

  stripCanvas.width  = TOTAL_W;
  stripCanvas.height = TOTAL_H;
  const ctx = stripCanvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Background
  drawBackground(ctx, TOTAL_W, TOTAL_H, state.currentFrame);

  // Header text
  drawHeader(ctx, TOTAL_W, HEADER, state.currentFrame);

  // Photos
  for (let i = 0; i < count; i++) {
    let x, y;
    if (state.stripLayout === 'horizontal') {
      x = PAD + i * (PHOTO_W + PAD);
      y = HEADER + PAD;
    } else {
      x = PAD;
      y = HEADER + PAD + i * (PHOTO_H + PAD);
    }
    await drawPhoto(ctx, state.photos[i], x, y, PHOTO_W, PHOTO_H, state.currentFrame);
  }

  // Footer
  drawFooter(ctx, TOTAL_W, TOTAL_H, FOOTER, state.currentFrame);
}

function drawBackground(ctx, w, h, frame) {
  const frames = {
    kawaii:  ['#ffe0f5', '#ede9fe'],
    retro:   ['#f5e6d0', '#c8a97a'],
    rainbow: ['#fff0f0', '#f0f8ff'],
    star:    ['#1a0a2e', '#2d1454'],
    mint:    ['#e6faf3', '#c8f5e6'],
    dark:    ['#1f2937', '#111827'],
    valentines: ['#ff9a9e', '#fecfef'],
    ocean:   ['#00c6ff', '#0072ff'],
    autumn:  ['#f12711', '#f5af19'],
    y2k:     ['#ff00ff', '#00ffff'],
    floral:  ['#d4fc79', '#96e6a1'],
    space:   ['#0f2027', '#203a43'],
    clouds:  ['#89f7fe', '#66a6ff'],
    sunset:  ['#fa709a', '#fee140'],
    candy:   ['#ff9a9e', '#fecfef'],
    halloween: ['#ff4e50', '#f9d423'],
    xmas:    ['#11998e', '#38ef7d'],
    minimal: ['#fdfbfb', '#ebedee'],
  };
  const [c1, c2] = frames[frame] || frames.kawaii;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, c1);
  grad.addColorStop(1, c2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Pattern overlay
  drawPattern(ctx, w, h, frame);
}

function drawPattern(ctx, w, h, frame) {
  ctx.save();
  ctx.globalAlpha = 0.18;
  const emojis = {
    kawaii:  ['🌸', '💖', '⭐', '🌷', '✨'],
    retro:   ['📷', '🎞️', '📻', '🎵'],
    rainbow: ['🌈', '☁️', '⭐', '🦄'],
    star:    ['⭐', '🌟', '💫', '✨'],
    mint:    ['🍃', '🌿', '🌱', '🍀'],
    dark:    ['🌙', '⭐', '🌌', '💫'],
    valentines: ['💖', '💕', '💌', '🌹', '❤️'],
    ocean:   ['🌊', '🐚', '🐠', '🐬', '🏝️'],
    autumn:  ['🍁', '🍂', '🍄', '🐿️', '🎃'],
    y2k:     ['💿', '✨', '🦋', '📱', '🍒'],
    floral:  ['🌺', '🌸', '🌼', '🌻', '🌷'],
    space:   ['🚀', '🛸', '👽', '🪐', '🌌'],
    clouds:  ['☁️', '🌤️', '🕊️', '🪁', '✈️'],
    sunset:  ['🌇', '🌅', '🍹', '🌴', '☀️'],
    candy:   ['🍬', '🍭', '🍧', '🍦', '🧁'],
    halloween: ['🎃', '👻', '🦇', '🕷️', '🕸️'],
    xmas:    ['🎄', '🎅', '🎁', '❄️', '⛄'],
    minimal: [' '],
  };
  const list = emojis[frame] || emojis.kawaii;
  ctx.font = '22px serif';
  for (let y = 0; y < h; y += 70) {
    for (let x = 0; x < w; x += 80) {
      ctx.fillText(list[Math.floor((x + y) / 80) % list.length], x + 10, y + 30);
    }
  }
  ctx.restore();
}

function drawHeader(ctx, w, headerH, frame) {
  const colors = {
    kawaii:  { title: '#e0508f', sub: '#c084fc' },
    retro:   { title: '#8b5e3c', sub: '#a0522d' },
    rainbow: { title: '#ff6b6b', sub: '#4d96ff' },
    star:    { title: '#fbbf24', sub: '#f9a8d4' },
    mint:    { title: '#059669', sub: '#34d399' },
    dark:    { title: '#e5e7eb', sub: '#9ca3af' },
    valentines: { title: '#ff4d4d', sub: '#e60000' },
    ocean:   { title: '#ffffff', sub: '#e0f7fa' },
    autumn:  { title: '#5c0000', sub: '#8a0000' },
    y2k:     { title: '#ffffff', sub: '#ff00ff' },
    floral:  { title: '#ff758c', sub: '#ff7eb3' },
    space:   { title: '#8e2de2', sub: '#4a00e0' },
    clouds:  { title: '#ffffff', sub: '#0052d4' },
    sunset:  { title: '#ff0844', sub: '#ffb199' },
    candy:   { title: '#a18cd1', sub: '#fbc2eb' },
    halloween: { title: '#000000', sub: '#ff4e50' },
    xmas:    { title: '#c31432', sub: '#240b36' },
    minimal: { title: '#333333', sub: '#666666' },
  };
  const col = colors[frame] || colors.kawaii;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = 'bold 32px Pacifico, cursive';
  ctx.fillStyle = col.title;
  ctx.fillText('✿ CuteBooth ✿', w / 2, 46);
  ctx.font = 'bold 13px Nunito, sans-serif';
  ctx.fillStyle = col.sub;
  ctx.fillText('📸 Kenangan Manis ✨', w / 2, 68);
  ctx.restore();
}

async function drawPhoto(ctx, dataURL, x, y, pw, ph, frame) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      // Photo shadow
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.25)';
      ctx.shadowBlur  = 18;
      ctx.shadowOffsetX = 3;
      ctx.shadowOffsetY = 5;

      // Rounded clip
      roundRect(ctx, x, y, pw, ph, 12);
      ctx.clip();
      ctx.drawImage(img, x, y, pw, ph);
      ctx.restore();

      // Border decoration per frame
      drawPhotoBorder(ctx, x, y, pw, ph, frame);
      resolve();
    };
    img.src = dataURL;
  });
}

function drawPhotoBorder(ctx, x, y, pw, ph, frame) {
  const borders = {
    kawaii:  { color: '#ff6eb4', width: 5 },
    retro:   { color: '#a0522d', width: 6 },
    rainbow: { color: null,     width: 5 },   // gradient
    star:    { color: '#fbbf24', width: 5 },
    mint:    { color: '#34d399', width: 5 },
    dark:    { color: '#6b7280', width: 4 },
    valentines: { color: '#ff4d4d', width: 5 },
    ocean:   { color: '#0052cc', width: 5 },
    autumn:  { color: '#c21807', width: 5 },
    y2k:     { color: '#c0c0c0', width: 5 },
    floral:  { color: '#ff758c', width: 5 },
    space:   { color: '#8e2de2', width: 5 },
    clouds:  { color: '#ffffff', width: 5 },
    sunset:  { color: '#ff0844', width: 5 },
    candy:   { color: '#a18cd1', width: 5 },
    halloween: { color: '#000000', width: 5 },
    xmas:    { color: '#c31432', width: 5 },
    minimal: { color: '#e2d1c3', width: 2 },
    romance: { color: '#ff4d4d', width: 8, dash: [10, 10] },
    horror:  { color: '#660000', width: 15 },
    suspense:{ color: '#000000', width: 10 },
    pro:     { color: '#cccccc', width: 2 },
  };
  const b = borders[frame] || borders.kawaii;
  ctx.save();
  ctx.lineWidth = b.width;

  if (frame === 'rainbow') {
    const grad = ctx.createLinearGradient(x, y, x + pw, y + ph);
    grad.addColorStop(0,    '#ff6b6b');
    grad.addColorStop(0.25, '#ffd93d');
    grad.addColorStop(0.5,  '#6bcb77');
    grad.addColorStop(0.75, '#4d96ff');
    grad.addColorStop(1,    '#ff6b6b');
    ctx.strokeStyle = grad;
  } else {
    ctx.strokeStyle = b.color;
  }

  if (b.dash) ctx.setLineDash(b.dash);
  roundRect(ctx, x, y, pw, ph, 12);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawFooter(ctx, w, h, footerH, frame) {
  const y0 = h - footerH;
  const colors = {
    kawaii:  { line: '#ffb3d9', text: '#c084fc', date: '#ff6eb4' },
    retro:   { line: '#c8a97a', text: '#8b5e3c', date: '#a0522d' },
    rainbow: { line: '#a5f3fc', text: '#4d96ff', date: '#ff6b6b' },
    star:    { line: '#fbbf24', text: '#fde68a', date: '#f9a8d4' },
    mint:    { line: '#6ee7b7', text: '#059669', date: '#34d399' },
    dark:    { line: '#374151', text: '#9ca3af', date: '#6b7280' },
    valentines: { line: '#ffb3b3', text: '#e60000', date: '#ff4d4d' },
    ocean:   { line: '#80dfff', text: '#003d99', date: '#0052cc' },
    autumn:  { line: '#ffb366', text: '#5c0000', date: '#8a0000' },
    y2k:     { line: '#00ffff', text: '#ffffff', date: '#ff00ff' },
    floral:  { line: '#96e6a1', text: '#ff758c', date: '#ff7eb3' },
    space:   { line: '#203a43', text: '#8e2de2', date: '#4a00e0' },
    clouds:  { line: '#66a6ff', text: '#ffffff', date: '#0052d4' },
    sunset:  { line: '#fee140', text: '#ff0844', date: '#ffb199' },
    candy:   { line: '#fecfef', text: '#a18cd1', date: '#fbc2eb' },
    halloween: { line: '#f9d423', text: '#000000', date: '#ff4e50' },
    xmas:    { line: '#38ef7d', text: '#c31432', date: '#240b36' },
    minimal: { line: '#cccccc', text: '#333333', date: '#666666' },
    romance: { line: '#ffb3b3', text: '#e60000', date: '#ff4d4d' },
    horror:  { line: '#330000', text: '#990000', date: '#660000' },
    suspense:{ line: '#1f4037', text: '#000000', date: '#333333' },
    pro:     { line: '#e0e0e0', text: '#222222', date: '#555555' },
  };
  const col = colors[frame] || colors.kawaii;

  ctx.save();

  // Separator
  ctx.strokeStyle = col.line;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  if (state.stripLayout === 'horizontal') {
    ctx.moveTo(w / 4, y0 + 10);
    ctx.lineTo(w * 0.75, y0 + 10);
  } else {
    ctx.moveTo(20, y0 + 10);
    ctx.lineTo(w - 20, y0 + 10);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  const now = new Date();
  const dateStr = now.toLocaleDateString('id-ID', { day:'2-digit', month:'long', year:'numeric' });
  const timeStr = now.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' });

  ctx.textAlign = 'center';
  ctx.font = 'bold 15px Nunito, sans-serif';
  ctx.fillStyle = col.text;
  ctx.fillText('🌸 Cetak & Simpan Kenangan Kamu! 🌸', w / 2, y0 + 36);

  ctx.font = '12px Nunito, sans-serif';
  ctx.fillStyle = col.date;
  ctx.fillText(`📅 ${dateStr}  🕐 ${timeStr}`, w / 2, y0 + 58);

  ctx.font = 'bold 10px Nunito, sans-serif';
  ctx.fillStyle = col.date;
  ctx.globalAlpha = 0.55;
  ctx.fillText('made with ♥ CuteBooth', w / 2, y0 + 76);

  ctx.restore();
}

// ── Helpers ───────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Download ──────────────────────────────────────────
function downloadStrip() {
  if (state.photos.length === 0) return;
  const link = document.createElement('a');
  link.download = `cutebooth_${Date.now()}.png`;
  link.href = stripCanvas.toDataURL('image/png', 1.0);
  link.click();
  showToast('💾 Foto berhasil didownload!');
}

// ── Print ─────────────────────────────────────────────
function printStrip() {
  if (state.photos.length === 0) return;
  const dataURL = stripCanvas.toDataURL('image/png', 1.0);
  printContainer.innerHTML = `<img src="${dataURL}" alt="Strip Foto" style="max-width:100%;height:auto;"/>`;
  showToast('🖨️ Membuka dialog cetak...');
  setTimeout(() => { window.print(); }, 400);
}

// ── Toast ─────────────────────────────────────────────
let toastTimer = null;
function showToast(msg) {
  toastMsg.textContent = msg;
  toastMsg.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastMsg.classList.remove('show'), 2600);
}

// ── Loading ───────────────────────────────────────────
function showLoading(msg = 'Loading...') {
  loadingText.textContent = msg;
  loadingOverlay.style.display = 'flex';
}
function hideLoading() {
  loadingOverlay.style.display = 'none';
}

// ── PWA Service Worker Registration ───────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(registration => {
        console.log('[PWA] Service Worker registered with scope:', registration.scope);
      })
      .catch(err => {
        console.error('[PWA] Service Worker registration failed:', err);
        if (err.message && err.message.includes('Failed to access storage')) {
          console.warn('[PWA] Mode Offline diblokir karena browser membatasi akses Storage (mungkin karena Incognito atau Block 3rd-Party Cookies).');
        }
      });
      
    // Auto-update: Refresh otomatis saat ada pembaruan Service Worker
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        window.location.reload();
        refreshing = true;
      }
    });
  });
}
