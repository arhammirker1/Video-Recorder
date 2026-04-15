/* ═══════════════════════════════════════════════════════════════════════════
   VaultCam — app.js  (Camera + Screen Recorder with Camera Overlay)
   ═══════════════════════════════════════════════════════════════════════════ */

'use strict';

// ── Noise canvas ─────────────────────────────────────────────────────────────
(function generateNoise() {
  const canvas = document.getElementById('noise-canvas');
  const ctx = canvas.getContext('2d');
  let noiseThrottle = null;
function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
function draw() {
    const { width, height } = canvas;
    const img = ctx.createImageData(width, height);
    const buf = new Uint32Array(img.data.buffer);
    for (let i = 0; i < buf.length; i++) {
      const v = (Math.random() * 255) | 0;
      buf[i] = (255 << 24) | (v << 16) | (v << 8) | v;
    }
    ctx.putImageData(img, 0, 0);
  }
  state.meterInterval = setInterval(() => {
      if (!state.settings.showMeter) return;
      state.analyser.getByteFrequencyData(data);
      bars.forEach((bar, i) => {
})();

// ── MIME Type Detection — run once at startup ────────────────────────────────
// We probe every codec combo the browser supports and rank them by quality.
// This avoids the bug where MediaRecorder accepts "video/mp4" but writes
// corrupt data because the actual H.264/AAC muxer is missing at runtime.
const SUPPORTED_MIMES = (() => {
  const candidates = [
    // WebM — universally well-supported in Chrome/Firefox
    { mime: 'video/webm;codecs=vp9,opus',  label: 'WebM / VP9+Opus',   ext: 'webm', group: 'webm' },
    { mime: 'video/webm;codecs=vp8,opus',  label: 'WebM / VP8+Opus',   ext: 'webm', group: 'webm' },
    { mime: 'video/webm;codecs=av1,opus',  label: 'WebM / AV1+Opus',   ext: 'webm', group: 'webm' },
    { mime: 'video/webm',                  label: 'WebM (auto)',        ext: 'webm', group: 'webm' },
    // MP4 — only reliable in Chrome 130+ with specific codec strings
    { mime: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', label: 'MP4 / H.264+AAC', ext: 'mp4', group: 'mp4' },
    { mime: 'video/mp4;codecs=avc1,mp4a.40.2',        label: 'MP4 / H.264+AAC', ext: 'mp4', group: 'mp4' },
    { mime: 'video/mp4;codecs=h264,aac',               label: 'MP4 / H.264+AAC', ext: 'mp4', group: 'mp4' },
    { mime: 'video/mp4',                               label: 'MP4 (auto)',       ext: 'mp4', group: 'mp4' },
  ];
  return candidates.filter(c => {
    try { return MediaRecorder.isTypeSupported(c.mime); }
    catch (_) { return false; }
  });
})();

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  // Camera recording
  stream: null,
  cameraActive: false,          // whether camera is currently running
  mediaRecorder: null,
  chunks: [],
  isRecording: false,
  isPaused: false,
  startTime: null,
  pausedTime: 0,
  timerInterval: null,
  sizeMonitor: null,

  // Screen recording
  screenStream: null,
  screenMicStream: null,
  screenCamStream: null,
  screenAudioCtx: null,
  screenRecorder: null,
  screenChunks: [],
  isScreenRecording: false,
  isScreenPaused: false,
  screenStartTime: null,
  screenPausedTime: 0,
  screenTimerInterval: null,
  screenSizeMonitor: null,
  camOverlayVisible: false,
  mixedStream: null,

  // Audio meter
  audioCtx: null,
  analyser: null,
  meterInterval: null,

  // Library
  recordings: [],

  // Settings
  settings: {
    resolution: '1920x1080',
    fps: '60',
    videoBitrate: 5000000,
    sampleRate: 192000,
    channels: 2,
    echoCancellation: true,
    noiseSuppression: true,
    countdown: 3,
    autoDownload: true,
    showMeter: true,
    screenVideoBitrate: 10000000,
    screenFps: '60',
    camShape: 'rounded',
    camBorder: true,
  }
};

// ── DOM refs ──────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

// Camera
const previewVideo      = $('preview-video');
const previewOverlay    = $('preview-overlay');
const selectVideo       = $('select-video');
const selectAudio       = $('select-audio');
const selectFormat      = $('select-format');
const btnRecord         = $('btn-record');
const btnPause          = $('btn-pause');
const btnStop           = $('btn-stop');
const btnCameraOff      = $('btn-camera-off');
const btnCameraOn       = $('btn-camera-on');
const recBadge          = $('rec-badge');
const recTimeBadge      = $('rec-time-badge');
const timerDisplay      = $('timer-display');
const statusMsg         = $('status-msg');
const bitrateDisplay    = $('bitrate-display');
const sizeDisplay       = $('size-display');
const countdownOverlay  = $('countdown-overlay');
const countdownNumber   = $('countdown-number');
const libraryGrid       = $('library-grid');
const libraryEmpty      = $('library-empty');

// Screen
const screenPreviewVideo    = $('screen-preview-video');
const screenPreviewOverlay  = $('screen-preview-overlay');
const screenSelectAudio     = $('screen-select-audio');
const screenSelectCamera    = $('screen-select-camera');
const screenSelectFormat    = $('screen-select-format');
const screenCamSize         = $('screen-cam-size');
const btnScreenRecord       = $('btn-screen-record');
const btnScreenPause        = $('btn-screen-pause');
const btnScreenStop         = $('btn-screen-stop');
const btnToggleCamOverlay   = $('btn-toggle-cam-overlay');
const screenRecBadge        = $('screen-rec-badge');
const screenRecTimeBadge    = $('screen-rec-time-badge');
const screenStatusMsg       = $('screen-status-msg');
const screenBitrateDisplay  = $('screen-bitrate-display');
const screenSizeDisplay     = $('screen-size-display');
const camOverlay            = $('cam-overlay');
const camOverlayVideo       = $('cam-overlay-video');

// Sidebar widgets
const screenStatusDot    = $('screen-status-dot');
const screenWidgetStatus = $('screen-widget-status');
const screenWidgetSize   = $('screen-widget-size');
const screenWidgetCam    = $('screen-widget-cam');

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  loadSettings();
  populateFormatSelects();
  await enumerateDevices();
  bindNavigation();
  bindControls();
  bindScreenControls();
  bindSettings();
  bindCamOverlayDrag();
  renderLibrary();
  updateQualityBadges();
}

// ── Populate format dropdowns with only actually-supported codecs ─────────────
function populateFormatSelects() {
  const selects = [selectFormat, screenSelectFormat];

  if (SUPPORTED_MIMES.length === 0) {
    // Nothing supported — add a single fallback option
    selects.forEach(sel => {
      sel.innerHTML = '<option value="">— No supported format —</option>';
    });
    return;
  }

  selects.forEach(sel => {
    sel.innerHTML = '';
    // Deduplicate by label so we don't show "MP4 / H.264+AAC" twice
    const seen = new Set();
    SUPPORTED_MIMES.forEach(({ mime, label }) => {
      if (seen.has(label)) return;
      seen.add(label);
      const opt = new Option(label, mime);
      sel.appendChild(opt);
    });
  });
}

// ── Device enumeration ────────────────────────────────────────────────────────
async function enumerateDevices() {
  try {
    const probe = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    probe.getTracks().forEach(t => t.stop());
  } catch (_) {}

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();

    selectVideo.innerHTML = '<option value="">— Select camera —</option>';
    selectAudio.innerHTML = '<option value="">— Select mic —</option>';
    screenSelectAudio.innerHTML = '<option value="">— No mic —</option>';
    screenSelectCamera.innerHTML = '<option value="">— No camera —</option>';

    devices.forEach(d => {
      const label = d.label || `${d.kind} (${d.deviceId.slice(0, 8)})`;

      if (d.kind === 'videoinput') {
        selectVideo.appendChild(new Option(label, d.deviceId));
        screenSelectCamera.appendChild(new Option(label, d.deviceId));
      }
      if (d.kind === 'audioinput') {
        selectAudio.appendChild(new Option(label, d.deviceId));
        screenSelectAudio.appendChild(new Option(label, d.deviceId));
      }
    });

    if (selectVideo.options.length > 1) selectVideo.selectedIndex = 1;
    if (selectAudio.options.length > 1) selectAudio.selectedIndex = 1;
    if (screenSelectAudio.options.length > 1) screenSelectAudio.selectedIndex = 1;
    if (screenSelectCamera.options.length > 1) screenSelectCamera.selectedIndex = 1;

    await startPreview();
  } catch (err) {
    setStatus(`Device error: ${err.message}`, 'idle');
    toast(`Could not enumerate devices: ${err.message}`, 'error');
  }
}

// ── Camera preview ────────────────────────────────────────────────────────────
async function startPreview() {
  stopPreview(); // release any existing stream first

  const [w, h] = state.settings.resolution.split('x').map(Number);
  const constraints = {
    video: selectVideo.value
      ? { deviceId: { exact: selectVideo.value }, width: { ideal: w }, height: { ideal: h }, frameRate: { ideal: +state.settings.fps } }
      : { width: { ideal: w }, height: { ideal: h }, frameRate: { ideal: +state.settings.fps } },
    audio: selectAudio.value
  ? { deviceId: { exact: selectAudio.value }, sampleRate: Math.min(state.settings.sampleRate, 96000), channelCount: state.settings.channels, echoCancellation: true, noiseSuppression: true, autoGainControl: true, googNoiseSuppression: true, googHighpassFilter: true, googNoiseSuppression2: true }
  : { sampleRate: Math.min(state.settings.sampleRate, 96000), channelCount: state.settings.channels, echoCancellation: true, noiseSuppression: true, autoGainControl: true, googNoiseSuppression: true, googHighpassFilter: true, googNoiseSuppression2: true }
  };

  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    state.stream = stream;
    state.cameraActive = true;
    previewVideo.srcObject = stream;
    previewOverlay.classList.add('hidden');
    setupAudioMeter(stream);
    setStatus('Ready — select format and hit record', 'ready');
    updateCameraButtons();
  } catch (err) {
    state.cameraActive = false;
    previewOverlay.classList.remove('hidden');
    setStatus(`Stream error: ${err.message}`, 'idle');
    toast(`Camera/mic error: ${err.message}`, 'error');
    updateCameraButtons();
  }
}

// ── Stop / release camera completely ─────────────────────────────────────────
function stopPreview() {
  if (state.stream) {
    state.stream.getTracks().forEach(t => t.stop());
    state.stream = null;
  }
  // Tear down audio meter
  if (state.audioCtx) {
    state.audioCtx.close().catch(() => {});
    state.audioCtx = null;
    state.analyser = null;
  }
  clearInterval(state.meterInterval);
  state.meterInterval = null;

  // Reset meter bars
  $$('#meter-bars .meter-bar').forEach(bar => {
    bar.style.height = '5%';
    bar.classList.remove('active-low', 'active-mid', 'active-high');
  });

  previewVideo.srcObject = null;
  state.cameraActive = false;
  previewOverlay.classList.remove('hidden');
  setStatus('Camera off — click ▶ to start camera', 'idle');
  updateCameraButtons();
}

function updateCameraButtons() {
  if (btnCameraOff)  btnCameraOff.style.display  = state.cameraActive ? 'flex' : 'none';
  if (btnCameraOn)   btnCameraOn.style.display    = state.cameraActive ? 'none' : 'flex';
  if (btnRecord)     btnRecord.disabled           = !state.cameraActive;
}

// ── Audio Meter ───────────────────────────────────────────────────────────────
function setupAudioMeter(stream) {
  if (state.audioCtx) state.audioCtx.close().catch(() => {});
  clearInterval(state.meterInterval);

  try {
    state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    state.analyser = state.audioCtx.createAnalyser();
    state.analyser.fftSize = 256;
    state.audioCtx.createMediaStreamSource(stream).connect(state.analyser);

    const bars = $$('#meter-bars .meter-bar');
    const data = new Uint8Array(state.analyser.frequencyBinCount);

    state.meterInterval = setInterval(() => {
      if (!state.settings.showMeter) return;
      state.analyser.getByteFrequencyData(data);
      bars.forEach((bar, i) => {
        const val = data[Math.floor((i / bars.length) * data.length)] / 255;
        bar.style.height = Math.max(5, Math.round(val * 100)) + '%';
        bar.classList.toggle('active-low',  val > 0.05 && val <= 0.5);
        bar.classList.toggle('active-mid',  val > 0.5  && val <= 0.8);
        bar.classList.toggle('active-high', val > 0.8);
      });
    }, 100);
  } catch (e) { console.warn('Audio meter init:', e); }
}

// ── Camera Recording ──────────────────────────────────────────────────────────
async function startRecording() {
  if (!state.stream) { toast('No active camera stream.', 'error'); return; }

  if (state.settings.countdown > 0) await runCountdown(state.settings.countdown);

  // Get the selected mime, then verify it's truly supported
  const selectedMime = selectFormat.value;
  const mimeType = resolveMime(selectedMime);
  if (!mimeType) {
    toast('No supported recording format found in this browser.', 'error');
    return;
  }

  state.chunks = [];

  let recorder;
  try {
    recorder = new MediaRecorder(state.stream, {
      mimeType,
      videoBitsPerSecond: state.settings.videoBitrate,
      audioBitsPerSecond: 320000,
    });
  } catch (err) {
    toast(`MediaRecorder error: ${err.message}`, 'error');
    return;
  }

  state.mediaRecorder = recorder;
  recorder.ondataavailable = e => { if (e.data?.size > 0) state.chunks.push(e.data); };
  recorder.onstop = () => finalizeRecording(
    state.chunks, recorder.mimeType, 'camera', state.startTime, state.pausedTime
  );
  recorder.start(1000);

  state.isRecording = true;
  state.isPaused = false;
  state.startTime = Date.now();
  state.pausedTime = 0;

  btnRecord.classList.add('recording');
  recBadge.classList.add('visible');
  btnPause.disabled = false;
  btnStop.disabled = false;
  // Disable camera-off while actively recording
  if (btnCameraOff) btnCameraOff.disabled = true;
  setStatus('● Recording…', 'recording-cam');
  startCamTimer();
  startCamSizeMonitor();
}

function pauseRecording() {
  if (!state.mediaRecorder) return;
  if (state.isPaused) {
    state.mediaRecorder.resume();
    state.isPaused = false;
    state.startTime = Date.now() - state.pausedTime;
    btnPause.innerHTML = pauseIcon();
    setStatus('● Recording…', 'recording-cam');
  } else {
    state.mediaRecorder.pause();
    state.isPaused = true;
    state.pausedTime = Date.now() - state.startTime;
    btnPause.innerHTML = playIcon();
    setStatus('⏸ Paused', 'idle');
  }
}

function stopRecording() {
  if (!state.mediaRecorder) return;
  state.mediaRecorder.stop();
  state.isRecording = false;
  state.isPaused = false;
  btnRecord.classList.remove('recording');
  recBadge.classList.remove('visible');
  btnPause.disabled = true;
  btnStop.disabled = true;
  if (btnCameraOff) btnCameraOff.disabled = false;
  btnPause.innerHTML = pauseIcon();
  stopCamTimer();
  clearInterval(state.sizeMonitor);
  setStatus('Saving…', 'ready');
}

function startCamTimer() {
  state.timerInterval = setInterval(() => {
    if (state.isPaused) return;
    const s = Math.round((Date.now() - state.startTime) / 1000);
    const str = formatTime(s);
    timerDisplay.textContent = str;
    recTimeBadge.textContent = str.slice(3);
  }, 500);
}
function stopCamTimer() { clearInterval(state.timerInterval); }

function startCamSizeMonitor() {
  let prevBits = 0;
  state.sizeMonitor = setInterval(() => {
    const bytes = state.chunks.reduce((a, c) => a + c.size, 0);
    sizeDisplay.textContent = formatBytes(bytes);
    const kbps = Math.round((bytes * 8 - prevBits) / 1000 / 0.5);
    prevBits = bytes * 8;
    if (kbps > 0) bitrateDisplay.textContent = `~${kbps} kbps`;
  }, 500);
}

// ── Screen Recording ──────────────────────────────────────────────────────────
async function startScreenRecording() {
  let screenStream;
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        frameRate: { ideal: +state.settings.screenFps, max: +state.settings.screenFps },
        width:     { ideal: 1920 },
        height:    { ideal: 1080 },
        cursor: 'always',
      },
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        sampleRate: 48000,
        channelCount: 2,
      },
      selfBrowserSurface: 'include',
      surfaceSwitching: 'include',
    });
  } catch (err) {
    screenSetStatus(`Capture cancelled: ${err.message}`, 'idle');
    toast('Screen capture cancelled or denied.', 'info');
    return;
  }

  state.screenStream = screenStream;
  screenPreviewVideo.srcObject = screenStream;
  screenPreviewOverlay.classList.add('hidden');

  screenStream.getVideoTracks()[0].addEventListener('ended', () => {
    if (state.isScreenRecording) stopScreenRecording();
  });

  // Mic audio
  let micStream = null;
  if (screenSelectAudio.value) {
    try {
micStream = await navigator.mediaDevices.getUserMedia({
  audio: {
    deviceId: { exact: screenSelectAudio.value },
    sampleRate: 48000,
    channelCount: 2,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    googNoiseSuppression: true,
    googHighpassFilter: true,
    googNoiseSuppression2: true,
  },
        video: false,
      });
      state.screenMicStream = micStream;
    } catch (e) {
      toast(`Mic unavailable: ${e.message}`, 'info');
    }
  }

  // Camera overlay
  if (screenSelectCamera.value) {
    await startCamOverlay(screenSelectCamera.value);
  }

  // Build mixed stream
  const finalStream = buildMixedStream(screenStream, micStream);
  state.mixedStream = finalStream;

  if (state.settings.countdown > 0) await runCountdown(state.settings.countdown);

  const selectedMime = screenSelectFormat.value;
  const mimeType = resolveMime(selectedMime);
  if (!mimeType) {
    toast('No supported recording format found in this browser.', 'error');
    cleanupScreenStreams();
    return;
  }

  state.screenChunks = [];

  let recorder;
  try {
    recorder = new MediaRecorder(finalStream, {
      mimeType,
      videoBitsPerSecond: state.settings.screenVideoBitrate,
      audioBitsPerSecond: 320000,
    });
  } catch (err) {
    toast(`Screen recorder error: ${err.message}`, 'error');
    cleanupScreenStreams();
    return;
  }

  state.screenRecorder = recorder;
  recorder.ondataavailable = e => { if (e.data?.size > 0) state.screenChunks.push(e.data); };
  recorder.onstop = () => finalizeRecording(
    state.screenChunks, recorder.mimeType, 'screen', state.screenStartTime, state.screenPausedTime
  );
  recorder.start(1000);

  state.isScreenRecording = true;
  state.isScreenPaused = false;
  state.screenStartTime = Date.now();
  state.screenPausedTime = 0;

  btnScreenRecord.classList.add('recording');
  screenRecBadge.classList.add('visible');
  btnScreenPause.disabled = false;
  btnScreenStop.disabled = false;
  btnToggleCamOverlay.disabled = false;

  screenStatusDot.classList.add('recording');
  screenWidgetStatus.textContent = 'Recording';
  screenWidgetCam.textContent = state.camOverlayVisible ? 'Active' : 'Off';

  screenSetStatus('● Screen recording…', 'recording');
  startScreenTimer();
  startScreenSizeMonitor();
}

function buildMixedStream(screenStream, micStream) {
  const videoTrack = screenStream.getVideoTracks()[0];
  const audioTracks = [...screenStream.getAudioTracks()];

  if (!micStream) {
    return new MediaStream([videoTrack, ...audioTracks]);
  }

  try {
    const ctx = new AudioContext({ sampleRate: 48000 });
    state.screenAudioCtx = ctx;
    const dest = ctx.createMediaStreamDestination();

    if (audioTracks.length > 0) {
      const screenAudioStream = new MediaStream(audioTracks);
      ctx.createMediaStreamSource(screenAudioStream).connect(dest);
    }

    if (micStream.getAudioTracks().length > 0) {
      const micGain = ctx.createGain();
      micGain.gain.value = 1.0;
      ctx.createMediaStreamSource(micStream).connect(micGain);
      micGain.connect(dest);
    }

    const mixedAudio = dest.stream.getAudioTracks()[0];
    return new MediaStream([videoTrack, mixedAudio].filter(Boolean));
  } catch (e) {
    console.warn('Audio mix failed, falling back:', e);
    return new MediaStream([videoTrack, ...audioTracks, ...micStream.getAudioTracks()]);
  }
}

async function startCamOverlay(deviceId) {
  try {
    const camStream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: { exact: deviceId },
        width: { ideal: 640 }, height: { ideal: 480 },
        frameRate: { ideal: 30 },
      },
      audio: false,
    });
    state.screenCamStream = camStream;
    camOverlayVideo.srcObject = camStream;
    showCamOverlay(true);
    state.camOverlayVisible = true;
    btnToggleCamOverlay.classList.add('cam-on');
  } catch (e) {
    toast(`Camera overlay error: ${e.message}`, 'info');
  }
}

function showCamOverlay(visible) {
  camOverlay.style.display = visible ? 'block' : 'none';
  applyCamShape();
  applyCamSize();
  screenWidgetCam.textContent = visible ? 'Active' : 'Off';
}

function applyCamShape() {
  camOverlay.classList.remove('shape-circle', 'shape-rounded', 'shape-rect');
  const shape = state.settings.camShape;
  if (shape === 'circle') camOverlay.classList.add('shape-circle');
  else if (shape === 'rect') camOverlay.classList.add('shape-rect');
  else camOverlay.classList.add('shape-rounded');
}

function applyCamSize() {
  const sz = screenCamSize.value;
  camOverlay.classList.remove('size-small', 'size-medium', 'size-large');
  camOverlay.classList.add(`size-${sz}`);
}

function toggleCamOverlay() {
  if (!state.screenCamStream) return;
  state.camOverlayVisible = !state.camOverlayVisible;
  showCamOverlay(state.camOverlayVisible);
  btnToggleCamOverlay.classList.toggle('cam-on', state.camOverlayVisible);
}

function pauseScreenRecording() {
  if (!state.screenRecorder) return;
  if (state.isScreenPaused) {
    state.screenRecorder.resume();
    state.isScreenPaused = false;
    state.screenStartTime = Date.now() - state.screenPausedTime;
    btnScreenPause.innerHTML = pauseIcon();
    screenSetStatus('● Screen recording…', 'recording');
  } else {
    state.screenRecorder.pause();
    state.isScreenPaused = true;
    state.screenPausedTime = Date.now() - state.screenStartTime;
    btnScreenPause.innerHTML = playIcon();
    screenSetStatus('⏸ Paused', 'idle');
  }
}

function stopScreenRecording() {
  if (!state.screenRecorder) return;
  state.screenRecorder.stop();
  state.isScreenRecording = false;
  state.isScreenPaused = false;

  btnScreenRecord.classList.remove('recording');
  screenRecBadge.classList.remove('visible');
  btnScreenPause.disabled = true;
  btnScreenStop.disabled = true;
  btnScreenPause.innerHTML = pauseIcon();
  stopScreenTimer();
  clearInterval(state.screenSizeMonitor);
  screenSetStatus('Saving…', 'ready');

  showCamOverlay(false);
  cleanupScreenStreams();

  screenStatusDot.classList.remove('recording');
  screenWidgetStatus.textContent = 'Idle';
  screenWidgetCam.textContent = 'Off';
}

function cleanupScreenStreams() {
  if (state.screenStream) { state.screenStream.getTracks().forEach(t => t.stop()); state.screenStream = null; }
  if (state.screenMicStream) { state.screenMicStream.getTracks().forEach(t => t.stop()); state.screenMicStream = null; }
  if (state.screenCamStream) { state.screenCamStream.getTracks().forEach(t => t.stop()); state.screenCamStream = null; }
  if (state.screenAudioCtx) { state.screenAudioCtx.close().catch(() => {}); state.screenAudioCtx = null; }
  state.camOverlayVisible = false;
  btnToggleCamOverlay.classList.remove('cam-on');
  btnToggleCamOverlay.disabled = true;
  camOverlayVideo.srcObject = null;
  screenPreviewVideo.srcObject = null;
  screenPreviewOverlay.classList.remove('hidden');
}

function startScreenTimer() {
  state.screenTimerInterval = setInterval(() => {
    if (state.isScreenPaused) return;
    const s = Math.round((Date.now() - state.screenStartTime) / 1000);
    const str = formatTime(s);
    timerDisplay.textContent = str;
    screenRecTimeBadge.textContent = str.slice(3);
  }, 500);
}
function stopScreenTimer() {
  clearInterval(state.screenTimerInterval);
  timerDisplay.textContent = '00:00:00';
}

function startScreenSizeMonitor() {
  let prevBits = 0;
  state.screenSizeMonitor = setInterval(() => {
    const bytes = state.screenChunks.reduce((a, c) => a + c.size, 0);
    screenSizeDisplay.textContent = formatBytes(bytes);
    screenWidgetSize.textContent = formatBytes(bytes);
    const kbps = Math.round((bytes * 8 - prevBits) / 1000 / 0.5);
    prevBits = bytes * 8;
    if (kbps > 0) screenBitrateDisplay.textContent = `~${kbps} kbps`;
  }, 500);
}

// ── Finalize (shared) ─────────────────────────────────────────────────────────
function finalizeRecording(chunks, mimeType, type, startTime, pausedTime) {
  if (!chunks || chunks.length === 0) {
    toast('Recording was empty — no data captured.', 'error');
    return;
  }

  // Determine the correct MIME type and extension
  // IMPORTANT: use the mimeType that MediaRecorder actually used (recorder.mimeType),
  // NOT the user-selected value, because the browser may have normalised it.
  const effectiveMime = mimeType || 'video/webm';

  // Derive extension from what the recorder actually produced
  let ext = 'webm';
  if (effectiveMime.startsWith('video/mp4')) ext = 'mp4';
  else if (effectiveMime.startsWith('video/x-matroska')) ext = 'mkv';

  const blob = new Blob(chunks, { type: effectiveMime });
  const url  = URL.createObjectURL(blob);
  const now  = new Date();
  const prefix = type === 'screen' ? 'VaultCam_Screen' : 'VaultCam_Camera';
  const name = `${prefix}_${formatDateFile(now)}.${ext}`;

  const elapsed  = startTime ? Math.round((Date.now() - startTime) / 1000) : 0;
  const duration = formatTime(elapsed);

  const rec = { id: Date.now(), name, blob, url, mimeType: effectiveMime, duration, size: blob.size, date: now, type };
  state.recordings.unshift(rec);
  renderLibrary();

  if (state.settings.autoDownload) downloadBlob(blob, name);

  if (type === 'screen') {
    screenSetStatus(`Saved: ${name}`, 'ready');
    screenBitrateDisplay.textContent = '';
    screenSizeDisplay.textContent = '';
    screenWidgetSize.textContent = '—';
  } else {
    setStatus(`Saved: ${name}`, 'ready');
    bitrateDisplay.textContent = '';
    sizeDisplay.textContent = '';
    timerDisplay.textContent = '00:00:00';
  }

  toast(`${type === 'screen' ? '🖥' : '🎥'} Saved: ${name}`, 'success');
}

// ── MIME resolution — returns the actual mime string to use ──────────────────
// If the chosen mime works, use it. Otherwise fall back to the best available.
function resolveMime(preferred) {
  if (preferred && MediaRecorder.isTypeSupported(preferred)) return preferred;
  // fallback to first supported
  if (SUPPORTED_MIMES.length > 0) return SUPPORTED_MIMES[0].mime;
  return null;
}

// ── Countdown ─────────────────────────────────────────────────────────────────
function runCountdown(seconds) {
  return new Promise(resolve => {
    countdownOverlay.classList.remove('hidden');
    let n = seconds;
    countdownNumber.textContent = n;
    const iv = setInterval(() => {
      n--;
      if (n <= 0) { clearInterval(iv); countdownOverlay.classList.add('hidden'); resolve(); }
      else countdownNumber.textContent = n;
    }, 1000);
  });
}

// ── Camera overlay drag & resize ──────────────────────────────────────────────
function bindCamOverlayDrag() {
  const frame = $('screen-preview-frame');
  let dragging = false, resizing = false;
  let startX, startY, startLeft, startTop, startW;

  camOverlay.addEventListener('mousedown', e => {
    if (e.target.closest('.cam-overlay-resize') ||
        e.target.closest('.cam-overlay-controls') ||
        e.target.closest('.cam-ctrl-btn')) return;
    dragging = true;
    startX = e.clientX; startY = e.clientY;
    const rect  = camOverlay.getBoundingClientRect();
    const pRect = frame.getBoundingClientRect();
    startLeft = rect.left - pRect.left;
    startTop  = rect.top  - pRect.top;
    e.preventDefault();
  });

  $('cam-resize-handle').addEventListener('mousedown', e => {
    resizing = true;
    startX = e.clientX;
    startW = camOverlay.offsetWidth;
    e.stopPropagation();
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    const frameRect = frame.getBoundingClientRect();
    if (dragging) {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const newLeft = Math.max(0, Math.min(startLeft + dx, frameRect.width  - camOverlay.offsetWidth));
      const newTop  = Math.max(0, Math.min(startTop  + dy, frameRect.height - camOverlay.offsetHeight));
      camOverlay.style.left   = newLeft + 'px';
      camOverlay.style.top    = newTop  + 'px';
      camOverlay.style.right  = 'auto';
      camOverlay.style.bottom = 'auto';
    }
    if (resizing) {
      const dx = e.clientX - startX;
      const newW = Math.max(100, Math.min(startW + dx, frameRect.width * 0.6));
      camOverlay.style.width = newW + 'px';
      camOverlay.classList.remove('size-small', 'size-medium', 'size-large');
    }
  });

  document.addEventListener('mouseup', () => { dragging = false; resizing = false; });

  const snap = (corner) => {
    const pad = 16;
    camOverlay.style.left = 'auto'; camOverlay.style.top = 'auto';
    camOverlay.style.right = 'auto'; camOverlay.style.bottom = 'auto';
    if (corner === 'tl') { camOverlay.style.left = pad + 'px'; camOverlay.style.top = pad + 'px'; }
    if (corner === 'tr') { camOverlay.style.right = pad + 'px'; camOverlay.style.top = pad + 'px'; }
    if (corner === 'bl') { camOverlay.style.left = pad + 'px'; camOverlay.style.bottom = pad + 'px'; }
    if (corner === 'br') { camOverlay.style.right = pad + 'px'; camOverlay.style.bottom = pad + 'px'; }
  };

  $('cam-corner-tl').addEventListener('click', () => snap('tl'));
  $('cam-corner-tr').addEventListener('click', () => snap('tr'));
  $('cam-corner-bl').addEventListener('click', () => snap('bl'));
  $('cam-corner-br').addEventListener('click', e => { e.stopPropagation(); snap('br'); });
}

// ── Library ───────────────────────────────────────────────────────────────────
function renderLibrary() {
  libraryGrid.querySelectorAll('.library-card').forEach(el => el.remove());

  if (state.recordings.length === 0) {
    libraryEmpty.style.display = 'flex'; return;
  }
  libraryEmpty.style.display = 'none';

  state.recordings.forEach(rec => {
    const card = document.createElement('div');
    card.className = 'library-card';
    card.dataset.id = rec.id;
    const typeLabel = rec.type === 'screen' ? '🖥 Screen' : '🎥 Camera';
    card.innerHTML = `
      <div class="library-thumb">
        <video src="${rec.url}" preload="metadata" muted></video>
        <div class="library-duration">${rec.duration}</div>
        <div class="library-type-badge ${rec.type || 'camera'}">${typeLabel}</div>
      </div>
      <div class="library-card-info">
        <div class="library-card-name" title="${rec.name}">${rec.name}</div>
        <div class="library-card-meta">
          <span>${formatBytes(rec.size)}</span>
          <span>${rec.date.toLocaleString()}</span>
        </div>
      </div>
      <div class="library-card-actions">
        <button class="lib-action-btn" data-action="download">↓ Download</button>
        <button class="lib-action-btn" data-action="play">▶ Play</button>
        <button class="lib-action-btn danger" data-action="delete">✕</button>
      </div>`;

    card.querySelector('[data-action="download"]').addEventListener('click', e => { e.stopPropagation(); downloadBlob(rec.blob, rec.name); });
    card.querySelector('[data-action="play"]').addEventListener('click', e => { e.stopPropagation(); openPlayer(rec); });
    card.querySelector('[data-action="delete"]').addEventListener('click', e => { e.stopPropagation(); deleteRecording(rec.id); });
    libraryGrid.appendChild(card);
  });
}

function deleteRecording(id) {
  const idx = state.recordings.findIndex(r => r.id === id);
  if (idx > -1) {
    URL.revokeObjectURL(state.recordings[idx].url);
    state.recordings.splice(idx, 1);
    renderLibrary();
    toast('Recording deleted', 'info');
  }
}

function openPlayer(rec) {
  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><body style="margin:0;background:#000;display:flex;align-items:center;justify-content:center;height:100vh">
    <video src="${rec.url}" controls autoplay style="max-width:100%;max-height:100vh"></video></body></html>`);
}

// ── Settings ──────────────────────────────────────────────────────────────────
function loadSettings() {
  try { Object.assign(state.settings, JSON.parse(localStorage.getItem('vaultcam-settings') || '{}')); } catch (_) {}
}
function saveSettings() { localStorage.setItem('vaultcam-settings', JSON.stringify(state.settings)); }

function bindSettings() {
  $('set-resolution').value      = state.settings.resolution;
  $('set-fps').value             = state.settings.fps;
  $('set-vbitrate').value        = state.settings.videoBitrate;
  $('set-samplerate').value      = state.settings.sampleRate;
  $('set-channels').value        = state.settings.channels;
  $('set-echo').checked          = state.settings.echoCancellation;
  $('set-noise').checked         = state.settings.noiseSuppression;
  $('set-countdown').value       = state.settings.countdown;
  $('set-autodownload').checked  = state.settings.autoDownload;
  $('set-showmeter').checked     = state.settings.showMeter;
  $('set-screen-vbitrate').value = state.settings.screenVideoBitrate;
  $('set-screen-fps').value      = state.settings.screenFps;
  $('set-cam-shape').value       = state.settings.camShape;
  $('set-cam-border').checked    = state.settings.camBorder;

  const apply = () => {
    state.settings.resolution         = $('set-resolution').value;
    state.settings.fps                = $('set-fps').value;
    state.settings.videoBitrate       = +$('set-vbitrate').value;
    state.settings.sampleRate         = +$('set-samplerate').value;
    state.settings.channels           = +$('set-channels').value;
    state.settings.echoCancellation   = $('set-echo').checked;
    state.settings.noiseSuppression   = $('set-noise').checked;
    state.settings.countdown          = +$('set-countdown').value;
    state.settings.autoDownload       = $('set-autodownload').checked;
    state.settings.showMeter          = $('set-showmeter').checked;
    state.settings.screenVideoBitrate = +$('set-screen-vbitrate').value;
    state.settings.screenFps          = $('set-screen-fps').value;
    state.settings.camShape           = $('set-cam-shape').value;
    state.settings.camBorder          = $('set-cam-border').checked;
    saveSettings();
    updateQualityBadges();
    applyCamShape();
    if (!state.isRecording) startPreview();
  };

  ['set-resolution','set-fps','set-vbitrate','set-samplerate','set-channels','set-echo','set-noise',
   'set-countdown','set-autodownload','set-showmeter','set-screen-vbitrate','set-screen-fps',
   'set-cam-shape','set-cam-border'].forEach(id => $(id).addEventListener('change', apply));
}

function updateQualityBadges() {
  const [, h] = state.settings.resolution.split('x');
  $('q-badge-video').textContent = h >= 2160 ? '4K' : h >= 1080 ? '1080p' : h >= 720 ? '720p' : '480p';
  $('q-badge-fps').textContent   = state.settings.fps + 'fps';
  const sr = state.settings.sampleRate;
  $('q-badge-audio').textContent = sr >= 192000 ? '192kHz' : sr >= 96000 ? '96kHz' : sr >= 48000 ? '48kHz' : '44kHz';
}

// ── Navigation ────────────────────────────────────────────────────────────────
function bindNavigation() {
  $$('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const panel = btn.dataset.panel;
      const target = $(`panel-${panel}`);
      if (!target) { console.warn('Panel not found:', panel); return; }
      $$('.nav-btn').forEach(b => b.classList.remove('active'));
      $$('.panel').forEach(p => { p.classList.remove('active'); p.style.display = 'none'; });
      btn.classList.add('active');
      target.classList.add('active');
      target.style.display = 'flex';
      if (panel === 'library') renderLibrary();
    });
  });
}

// ── Control bindings ──────────────────────────────────────────────────────────
function bindControls() {
  btnRecord.addEventListener('click', () => {
    if (state.isRecording) stopRecording();
    else startRecording();
  });
  btnPause.addEventListener('click', pauseRecording);
  btnStop.addEventListener('click', stopRecording);

  // Camera on/off controls
  if (btnCameraOff) {
    btnCameraOff.addEventListener('click', () => {
      if (state.isRecording) {
        toast('Stop the current recording before turning off the camera.', 'info');
        return;
      }
      stopPreview();
      toast('Camera released', 'info');
    });
  }
  if (btnCameraOn) {
    btnCameraOn.addEventListener('click', () => {
      startPreview();
    });
  }

  selectVideo.addEventListener('change', () => { if (!state.isRecording) startPreview(); });
  selectAudio.addEventListener('change', () => { if (!state.isRecording) startPreview(); });

  $('btn-clear-library').addEventListener('click', () => {
    if (!state.recordings.length) return;
    if (confirm('Delete all recordings from this session?')) {
      state.recordings.forEach(r => URL.revokeObjectURL(r.url));
      state.recordings = [];
      renderLibrary();
      toast('Library cleared', 'info');
    }
  });

  $('btn-pip').addEventListener('click', () => {
    if (document.pictureInPictureEnabled && previewVideo.readyState >= 2) {
      if (document.pictureInPictureElement) document.exitPictureInPicture();
      else previewVideo.requestPictureInPicture().catch(e => toast(e.message, 'error'));
    }
  });

  $('btn-fullscreen').addEventListener('click', () => {
    const frame = $('preview-frame');
    if (document.fullscreenElement) document.exitFullscreen();
    else frame.requestFullscreen().catch(e => toast(e.message, 'error'));
  });

  navigator.mediaDevices.addEventListener('devicechange', enumerateDevices);
}

function bindScreenControls() {
  btnScreenRecord.addEventListener('click', () => {
    if (state.isScreenRecording) stopScreenRecording();
    else startScreenRecording();
  });

  btnScreenPause.addEventListener('click', pauseScreenRecording);
  btnScreenStop.addEventListener('click', stopScreenRecording);
  btnToggleCamOverlay.addEventListener('click', toggleCamOverlay);

  $('screen-btn-fullscreen').addEventListener('click', () => {
    const frame = $('screen-preview-frame');
    if (document.fullscreenElement) document.exitFullscreen();
    else frame.requestFullscreen().catch(e => toast(e.message, 'error'));
  });

  screenCamSize.addEventListener('change', applyCamSize);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function pauseIcon() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
}
function playIcon() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>`;
}

function formatTime(secs) {
  const h = String(Math.floor(secs / 3600)).padStart(2, '0');
  const m = String(Math.floor((secs % 3600) / 60)).padStart(2, '0');
  const s = String(secs % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(2) + ' GB';
}

function formatDateFile(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}-${String(d.getMinutes()).padStart(2,'0')}-${String(d.getSeconds()).padStart(2,'0')}`;
}

function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

function setStatus(msg, type) {
  statusMsg.textContent = msg;
  statusMsg.className = `status-${type}`;
}
function screenSetStatus(msg, type) {
  screenStatusMsg.textContent = msg;
  screenStatusMsg.className = `status-${type}`;
}

function toast(msg, type = 'info', duration = 3500) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  $('toast-container').appendChild(el);
  setTimeout(() => el.remove(), duration);
}

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);