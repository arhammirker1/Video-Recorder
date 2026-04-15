/* ═══════════════════════════════════════════════════════════════════════════
   VaultCam — app.js
   ═══════════════════════════════════════════════════════════════════════════ */

'use strict';

// ── Noise canvas ─────────────────────────────────────────────────────────────
(function generateNoise() {
  const canvas = document.getElementById('noise-canvas');
  const ctx = canvas.getContext('2d');
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
  resize(); draw();
  window.addEventListener('resize', () => { resize(); draw(); });
})();

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  stream: null,
  mediaRecorder: null,
  chunks: [],
  isRecording: false,
  isPaused: false,
  startTime: null,
  pausedTime: 0,
  timerInterval: null,
  audioCtx: null,
  analyser: null,
  meterInterval: null,
  recordings: [],   // { id, name, blob, url, duration, size, date }
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
  }
};

// ── DOM refs ──────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

const previewVideo   = $('preview-video');
const previewOverlay = $('preview-overlay');
const selectVideo    = $('select-video');
const selectAudio    = $('select-audio');
const selectFormat   = $('select-format');
const btnRecord      = $('btn-record');
const btnPause       = $('btn-pause');
const btnStop        = $('btn-stop');
const recordIcon     = $('record-icon');
const recordLabel    = $('record-btn-label');
const recBadge       = $('rec-badge');
const recTimeBadge   = $('rec-time-badge');
const timerDisplay   = $('timer-display');
const statusMsg      = $('status-msg');
const bitrateDisplay = $('bitrate-display');
const sizeDisplay    = $('size-display');
const libraryGrid    = $('library-grid');
const libraryEmpty   = $('library-empty');
const countdownOverlay = $('countdown-overlay');
const countdownNumber  = $('countdown-number');

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  loadSettings();
  await enumerateDevices();
  bindNavigation();
  bindControls();
  bindSettings();
  renderLibrary();
  updateQualityBadges();
}

// ── Device enumeration ────────────────────────────────────────────────────────
async function enumerateDevices() {
  try {
    // Request permissions first so labels are populated
    const probe = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    probe.getTracks().forEach(t => t.stop());
  } catch (_) { /* may fail if no device */ }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    selectVideo.innerHTML = '<option value="">— Select camera —</option>';
    selectAudio.innerHTML = '<option value="">— Select mic —</option>';

    devices.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label || `${d.kind} (${d.deviceId.slice(0, 8)})`;
      if (d.kind === 'videoinput') selectVideo.appendChild(opt);
      if (d.kind === 'audioinput') selectAudio.appendChild(opt);
    });

    // Auto-select first
    if (selectVideo.options.length > 1) selectVideo.selectedIndex = 1;
    if (selectAudio.options.length > 1) selectAudio.selectedIndex = 1;

    // Start preview
    await startPreview();
  } catch (err) {
    setStatus(`Device access error: ${err.message}`, 'idle');
    toast(`Could not enumerate devices: ${err.message}`, 'error');
  }
}

// ── Preview stream ────────────────────────────────────────────────────────────
async function startPreview() {
  if (state.stream) state.stream.getTracks().forEach(t => t.stop());

  const [w, h] = (state.settings.resolution).split('x').map(Number);
  const constraints = {
    video: selectVideo.value
      ? { deviceId: { exact: selectVideo.value }, width: { ideal: w }, height: { ideal: h }, frameRate: { ideal: +state.settings.fps } }
      : { width: { ideal: w }, height: { ideal: h }, frameRate: { ideal: +state.settings.fps } },
    audio: selectAudio.value
      ? {
          deviceId: { exact: selectAudio.value },
          sampleRate: state.settings.sampleRate,
          channelCount: state.settings.channels,
          echoCancellation: state.settings.echoCancellation,
          noiseSuppression: state.settings.noiseSuppression,
          autoGainControl: false,
        }
      : {
          sampleRate: state.settings.sampleRate,
          channelCount: state.settings.channels,
          echoCancellation: state.settings.echoCancellation,
          noiseSuppression: state.settings.noiseSuppression,
          autoGainControl: false,
        }
  };

  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    state.stream = stream;
    previewVideo.srcObject = stream;
    previewOverlay.classList.add('hidden');
    setupAudioMeter(stream);
    setStatus('Ready — select format and hit record', 'ready');
  } catch (err) {
    previewOverlay.classList.remove('hidden');
    setStatus(`Stream error: ${err.message}`, 'idle');
    toast(`Camera/mic access denied: ${err.message}`, 'error');
  }
}

// ── Audio Meter ───────────────────────────────────────────────────────────────
function setupAudioMeter(stream) {
  if (state.audioCtx) { state.audioCtx.close(); }
  if (state.meterInterval) { clearInterval(state.meterInterval); }

  try {
    state.audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: Math.min(state.settings.sampleRate, 96000) });
    state.analyser = state.audioCtx.createAnalyser();
    state.analyser.fftSize = 256;
    const source = state.audioCtx.createMediaStreamSource(stream);
    source.connect(state.analyser);

    const bars = $$('#meter-bars .meter-bar');
    const data = new Uint8Array(state.analyser.frequencyBinCount);

    state.meterInterval = setInterval(() => {
      if (!state.settings.showMeter) return;
      state.analyser.getByteFrequencyData(data);
      const numBars = bars.length;
      for (let i = 0; i < numBars; i++) {
        const idx = Math.floor((i / numBars) * data.length);
        const val = data[idx] / 255;
        const pct = Math.round(val * 100);
        bars[i].style.height = Math.max(5, pct) + '%';
        bars[i].classList.toggle('active-low',  val > 0.05 && val <= 0.5);
        bars[i].classList.toggle('active-mid',  val > 0.5  && val <= 0.8);
        bars[i].classList.toggle('active-high', val > 0.8);
      }
    }, 50);
  } catch (err) {
    console.warn('Audio meter init failed:', err);
  }
}

// ── Recording ─────────────────────────────────────────────────────────────────
async function startRecording() {
  if (!state.stream) {
    toast('No active stream. Select camera/mic first.', 'error'); return;
  }

  const countdown = state.settings.countdown;
  if (countdown > 0) {
    await runCountdown(countdown);
  }

  const mimeType = selectFormat.value;
  const supported = mimeType && MediaRecorder.isTypeSupported(mimeType)
    ? mimeType
    : (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus' : 'video/webm');

  const options = {
    mimeType: supported,
    videoBitsPerSecond: state.settings.videoBitrate,
    audioBitsPerSecond: 256000,
  };

  state.chunks = [];
  try {
    state.mediaRecorder = new MediaRecorder(state.stream, options);
  } catch (err) {
    toast(`MediaRecorder error: ${err.message}`, 'error'); return;
  }

  state.mediaRecorder.ondataavailable = e => {
    if (e.data && e.data.size > 0) state.chunks.push(e.data);
  };

  state.mediaRecorder.onstop = finalizeRecording;
  state.mediaRecorder.start(250); // collect every 250ms

  state.isRecording = true;
  state.isPaused = false;
  state.startTime = Date.now();
  state.pausedTime = 0;

  // UI
  btnRecord.classList.add('recording');
  recBadge.classList.add('visible');
  btnPause.disabled = false;
  btnStop.disabled = false;
  setStatus('● Recording…', 'recording');
  startTimer();
  startSizeMonitor();
}

function pauseRecording() {
  if (!state.mediaRecorder) return;
  if (state.isPaused) {
    state.mediaRecorder.resume();
    state.isPaused = false;
    state.startTime = Date.now() - state.pausedTime;
    btnPause.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
    setStatus('● Recording…', 'recording');
  } else {
    state.mediaRecorder.pause();
    state.isPaused = true;
    state.pausedTime = Date.now() - state.startTime;
    btnPause.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>`;
    setStatus('⏸ Paused', 'idle');
  }
}

function stopRecording() {
  if (!state.mediaRecorder) return;
  state.mediaRecorder.stop();
  state.isRecording = false;
  state.isPaused = false;

  // UI cleanup
  btnRecord.classList.remove('recording');
  recBadge.classList.remove('visible');
  btnPause.disabled = true;
  btnStop.disabled = true;
  btnPause.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
  stopTimer();
  clearInterval(state.sizeMonitor);
  setStatus('Saving…', 'ready');
}

function finalizeRecording() {
  const mimeType = state.mediaRecorder.mimeType || 'video/webm';
  const blob = new Blob(state.chunks, { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const ext  = mimeType.includes('mp4') ? 'mp4' : 'webm';
  const now  = new Date();
  const name = `VaultCam_${formatDateFile(now)}.${ext}`;
  const duration = formatTime(Math.round((Date.now() - state.startTime - state.pausedTime) / 1000));

  const rec = { id: Date.now(), name, blob, url, mimeType, duration, size: blob.size, date: now };
  state.recordings.unshift(rec);
  renderLibrary();

  if (state.settings.autoDownload) downloadBlob(blob, name);

  setStatus(`Saved: ${name}`, 'ready');
  bitrateDisplay.textContent = '';
  sizeDisplay.textContent = '';
  toast(`Recording saved: ${name}`, 'success');
  timerDisplay.textContent = '00:00:00';
}

// ── Timer ─────────────────────────────────────────────────────────────────────
function startTimer() {
  state.timerInterval = setInterval(() => {
    if (state.isPaused) return;
    const elapsed = Math.round((Date.now() - state.startTime) / 1000);
    const str = formatTime(elapsed);
    timerDisplay.textContent = str;
    recTimeBadge.textContent = str.slice(3); // mm:ss
  }, 500);
}
function stopTimer() { clearInterval(state.timerInterval); }

// ── Size monitor ──────────────────────────────────────────────────────────────
function startSizeMonitor() {
  let fakeBits = 0;
  state.sizeMonitor = setInterval(() => {
    const bytes = state.chunks.reduce((a, c) => a + c.size, 0);
    sizeDisplay.textContent = formatBytes(bytes);
    // Estimate bitrate from chunks
    const bitsNow = bytes * 8;
    const kbps = Math.round((bitsNow - fakeBits) / 1000 / 0.5);
    fakeBits = bitsNow;
    bitrateDisplay.textContent = kbps > 0 ? `~${kbps} kbps` : '';
  }, 500);
}

// ── Countdown ─────────────────────────────────────────────────────────────────
function runCountdown(seconds) {
  return new Promise(resolve => {
    countdownOverlay.classList.remove('hidden');
    let n = seconds;
    countdownNumber.textContent = n;
    const interval = setInterval(() => {
      n--;
      if (n <= 0) {
        clearInterval(interval);
        countdownOverlay.classList.add('hidden');
        resolve();
      } else {
        countdownNumber.textContent = n;
      }
    }, 1000);
  });
}

// ── Library ───────────────────────────────────────────────────────────────────
function renderLibrary() {
  const existing = libraryGrid.querySelectorAll('.library-card');
  existing.forEach(el => el.remove());

  if (state.recordings.length === 0) {
    libraryEmpty.style.display = 'flex';
    return;
  }
  libraryEmpty.style.display = 'none';

  state.recordings.forEach(rec => {
    const card = document.createElement('div');
    card.className = 'library-card';
    card.dataset.id = rec.id;
    card.innerHTML = `
      <div class="library-thumb">
        <video src="${rec.url}" preload="metadata" muted></video>
        <div class="library-duration">${rec.duration}</div>
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
  try {
    const saved = JSON.parse(localStorage.getItem('vaultcam-settings') || '{}');
    Object.assign(state.settings, saved);
  } catch (_) {}
}

function saveSettings() {
  localStorage.setItem('vaultcam-settings', JSON.stringify(state.settings));
}

function bindSettings() {
  // Apply saved values to UI
  $('set-resolution').value  = state.settings.resolution;
  $('set-fps').value         = state.settings.fps;
  $('set-vbitrate').value    = state.settings.videoBitrate;
  $('set-samplerate').value  = state.settings.sampleRate;
  $('set-channels').value    = state.settings.channels;
  $('set-echo').checked      = state.settings.echoCancellation;
  $('set-noise').checked     = state.settings.noiseSuppression;
  $('set-countdown').value   = state.settings.countdown;
  $('set-autodownload').checked = state.settings.autoDownload;
  $('set-showmeter').checked = state.settings.showMeter;

  const applyAndPreview = () => {
    state.settings.resolution       = $('set-resolution').value;
    state.settings.fps              = $('set-fps').value;
    state.settings.videoBitrate     = +$('set-vbitrate').value;
    state.settings.sampleRate       = +$('set-samplerate').value;
    state.settings.channels         = +$('set-channels').value;
    state.settings.echoCancellation = $('set-echo').checked;
    state.settings.noiseSuppression = $('set-noise').checked;
    state.settings.countdown        = +$('set-countdown').value;
    state.settings.autoDownload     = $('set-autodownload').checked;
    state.settings.showMeter        = $('set-showmeter').checked;
    saveSettings();
    updateQualityBadges();
    if (!state.isRecording) startPreview();
  };

  ['set-resolution','set-fps','set-vbitrate','set-samplerate','set-channels',
   'set-echo','set-noise','set-countdown','set-autodownload','set-showmeter']
    .forEach(id => $(id).addEventListener('change', applyAndPreview));
}

function updateQualityBadges() {
  const [,h] = state.settings.resolution.split('x');
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
      $$('.nav-btn').forEach(b => b.classList.remove('active'));
      $$('.panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      $(`panel-${panel}`).classList.add('active');
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

  selectVideo.addEventListener('change', () => { if (!state.isRecording) startPreview(); });
  selectAudio.addEventListener('change', () => { if (!state.isRecording) startPreview(); });

  $('btn-clear-library').addEventListener('click', () => {
    if (state.recordings.length === 0) return;
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

  // Re-enumerate on device change
  navigator.mediaDevices.addEventListener('devicechange', enumerateDevices);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
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
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

function setStatus(msg, type) {
  statusMsg.textContent = msg;
  statusMsg.className = `status-${type}`;
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
