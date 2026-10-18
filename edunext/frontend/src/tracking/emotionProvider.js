/**
 * EmotionProvider interface so the emotion model is swappable:
 *   init(): Promise<void>; infer(videoEl): Promise<probs|null>; dispose(): void
 * `probs` is the 7-class distribution consumed by shared/emotion.
 */

/** Real provider: @vladmandic/face-api TinyFaceDetector + FaceExpressionNet at ~1 Hz. */
export class FaceApiEmotionProvider {
  constructor() {
    this.ready = false;
    this.faceapi = null;
    this.options = null;
    this.busy = false;
  }

  async init() {
    // Dynamic import keeps face-api out of the initial bundle.
    const faceapi = await import('@vladmandic/face-api');
    this.faceapi = faceapi;
    try {
      await faceapi.tf.setBackend('webgl');
      await faceapi.tf.ready();
    } catch {
      // Fall back to the default (CPU) backend.
    }
    await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
    await faceapi.nets.faceExpressionNet.loadFromUri('/models');
    this.options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });
    this.ready = true;
  }

  async infer(videoEl) {
    if (!this.ready || !videoEl || videoEl.readyState < 2) return null;
    if (this.busy) return null; // skip rather than queue if the last infer is still running
    this.busy = true;
    try {
      const res = await this.faceapi
        .detectSingleFace(videoEl, this.options)
        .withFaceExpressions();
      if (!res) return null;
      const e = res.expressions;
      return {
        neutral: e.neutral,
        happy: e.happy,
        sad: e.sad,
        angry: e.angry,
        fearful: e.fearful,
        disgusted: e.disgusted,
        surprised: e.surprised,
      };
    } catch {
      return null;
    } finally {
      this.busy = false;
    }
  }

  dispose() {
    this.ready = false;
  }
}

/** Mock provider: emotion samples come from the MockSignalSource, so infer() is unused. */
export class MockEmotionProvider {
  async init() {}
  async infer() {
    return null;
  }
  dispose() {}
}
