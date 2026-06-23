// ReplayRecorder.js — Records and plays back game input frames
export class ReplayRecorder {
  constructor() {
    this.frames = [];
    this.isRecording = false;
    this.isPlaying = false;
    this.playbackFrame = 0;
    this.metadata = {};
  }

  startRecording(metadata = {}) {
    this.frames = [];
    this.isRecording = true;
    this.isPlaying = false;
    this.metadata = {
      ...metadata,
      timestamp: Date.now(),
      version: 1
    };
  }

  recordFrame(p1Keys, p2Keys, p1State, p2State) {
    if (!this.isRecording) return;
    this.frames.push({
      p1: { ...p1Keys },
      p2: { ...p2Keys },
      p1hp: p1State?.health ?? 0,
      p2hp: p2State?.health ?? 0
    });
  }

  stopRecording(result) {
    this.isRecording = false;
    this.metadata.result = result;
    this.metadata.totalFrames = this.frames.length;
    this.metadata.duration = Math.round(this.frames.length / 60 * 10) / 10; // seconds at 60fps
  }

  getReplayData() {
    return {
      metadata: this.metadata,
      frames: this.frames
    };
  }

  exportJSON() {
    return JSON.stringify(this.getReplayData());
  }

  loadReplay(data) {
    if (typeof data === 'string') data = JSON.parse(data);
    this.metadata = data.metadata;
    this.frames = data.frames;
    this.playbackFrame = 0;
    this.isPlaying = false;
    this.isRecording = false;
  }

  startPlayback() {
    this.isPlaying = true;
    this.playbackFrame = 0;
  }

  getPlaybackFrame() {
    if (!this.isPlaying || this.playbackFrame >= this.frames.length) {
      this.isPlaying = false;
      return null;
    }
    const frame = this.frames[this.playbackFrame];
    this.playbackFrame++;
    return frame;
  }

  getProgress() {
    if (this.frames.length === 0) return 0;
    return this.playbackFrame / this.frames.length;
  }

  seekTo(progress) {
    this.playbackFrame = Math.floor(progress * this.frames.length);
  }

  downloadReplay(filename = 'replay.json') {
    const blob = new Blob([this.exportJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Share via copy to clipboard
  async shareReplay() {
    const data = this.exportJSON();
    // Compress by removing whitespace
    try {
      await navigator.clipboard.writeText(data);
      return true;
    } catch {
      return false;
    }
  }
}
