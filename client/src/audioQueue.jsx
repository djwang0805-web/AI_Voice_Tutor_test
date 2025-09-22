let ctx;

export function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  return ctx;
}

export class AudioQueue {
  constructor() {
    this.ctx = getCtx();
    this.cursor = this.ctx.currentTime;
    this.minGap = 0.08;
  }

  async enqueue(arrayBuffer) {
    const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
    const src = this.ctx.createBufferSource();
    src.buffer = audioBuffer;
    src.connect(this.ctx.destination);

    const startAt = Math.max(this.ctx.currentTime + 0.02, this.cursor + this.minGap);
    src.start(startAt);
    this.cursor = startAt + audioBuffer.duration;

    return {startAt, duration: audioBuffer.duration};
  }

  playUrl(url) {
    const audio = new Audio(url);
    audio.play();
    return audio;
  }
}