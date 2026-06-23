class AudioManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.sfxGain = null;
    this.bgmGain = null;
    this._sfxVolume = parseFloat(localStorage.getItem('sfxVolume') ?? '0.8');
    this._bgmVolume = parseFloat(localStorage.getItem('bgmVolume') ?? '0.5');
    this._muted = localStorage.getItem('audioMuted') === 'true';
  }

  init() {
    if (this.ctx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;

    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this._muted ? 0 : 0.4;
    this.masterGain.connect(this.ctx.destination);

    // SFX gain node
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this._sfxVolume;
    this.sfxGain.connect(this.masterGain);

    // BGM gain node
    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.value = this._bgmVolume;
    this.bgmGain.connect(this.masterGain);
  }

  get sfxVolume() { return this._sfxVolume; }
  set sfxVolume(v) {
    this._sfxVolume = Math.max(0, Math.min(1, v));
    if (this.sfxGain) this.sfxGain.gain.value = this._sfxVolume;
    localStorage.setItem('sfxVolume', this._sfxVolume);
  }

  get bgmVolume() { return this._bgmVolume; }
  set bgmVolume(v) {
    this._bgmVolume = Math.max(0, Math.min(1, v));
    if (this.bgmGain) this.bgmGain.gain.value = this._bgmVolume;
    localStorage.setItem('bgmVolume', this._bgmVolume);
  }

  get muted() { return this._muted; }
  set muted(v) {
    this._muted = v;
    if (this.masterGain) this.masterGain.gain.value = v ? 0 : 0.4;
    localStorage.setItem('audioMuted', v);
  }

  toggleMute() {
    this.muted = !this._muted;
    return this._muted;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playTone(frequency, type, duration, vol = 1) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, this.ctx.currentTime);
    
    // Envelope
    gainNode.gain.setValueAtTime(vol, this.ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

    osc.connect(gainNode);
    gainNode.connect(this.sfxGain || this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  playLightAttack() {
    // Fast high pitched "whiff"
    this.playTone(600, 'triangle', 0.1, 0.5);
  }

  playHeavyAttack() {
    // Deeper, longer "whiff"
    this.playTone(250, 'square', 0.2, 0.8);
  }

  playFireball() {
    // Classic pew
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(800, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.3); // Pitch drop
    
    gainNode.gain.setValueAtTime(0.5, this.ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);
    
    osc.connect(gainNode);
    gainNode.connect(this.sfxGain || this.masterGain);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 0.3);
  }

  playDash() {
    // Fast swoosh
    this.playTone(400, 'sawtooth', 0.2, 0.3);
  }

  playHit() {
    // Noise burst effect using a buffer for impact sound
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 0.15; // 0.15 seconds
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    
    // Generate white noise
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    // Apply lowpass filter to make it sound like a thump/punch rather than static hiss
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1000;

    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(1.0, this.ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);

    noise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.sfxGain || this.masterGain);
    
    noise.start();
  }
  
  playDefend() {
    this.playTone(800, 'sine', 0.1, 0.6);
  }

  playDiveKickLaunch() {
    // Rising pitch for jump
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, this.ctx.currentTime + 0.2); 
    
    gainNode.gain.setValueAtTime(0.6, this.ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);
    
    osc.connect(gainNode);
    gainNode.connect(this.sfxGain || this.masterGain);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 0.2);
  }

  playDiveKickImpact() {
    // Huge explosion/impact
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 0.4;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1000, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.3);

    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(1.5, this.ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.4);

    noise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.sfxGain || this.masterGain);
    
    noise.start();
  }

  playCountdown() {
    this.playTone(800, 'sine', 0.1, 0.6);
  }

  playFight() {
    this.playTone(1200, 'square', 0.4, 0.8);
  }
}

export const audioManager = new AudioManager();
