import { DEFAULT_SCENARIO, phaseAt } from './scenarios.js';

/**
 * Synthetic signal source. Driven by the provider's virtual clock: on each
 * `pump(virtualNow)` it catches up by emitting 1 Hz presence + emotion samples
 * and target-rate blinks for the active scenario phase. Emits the exact same
 * sample shapes as the camera path.
 */
export class MockSignalSource {
  constructor(scenario = DEFAULT_SCENARIO) {
    this.scenario = scenario;
    this.reset();
  }

  reset(startVirtual = null) {
    this.startT = startVirtual;
    this.lastEmitT = startVirtual;
    this.blinkAcc = 0;
  }

  /**
   * @param {number} virtualNow  current virtual time (ms)
   * @param {(sample:object)=>void} emit
   */
  pump(virtualNow, emit) {
    if (this.startT == null) {
      this.startT = virtualNow;
      this.lastEmitT = virtualNow;
    }
    // Emit one sample set per elapsed virtual second (catch up if behind).
    while (this.lastEmitT + 1000 <= virtualNow) {
      this.lastEmitT += 1000;
      const elapsedS = (this.lastEmitT - this.startT) / 1000;
      const phase = phaseAt(this.scenario, elapsedS);

      emit({ type: 'presence', t: this.lastEmitT });
      emit({ type: 'emotion', t: this.lastEmitT, probs: phase.probs });

      this.blinkAcc += phase.bpm / 60;
      while (this.blinkAcc >= 1) {
        this.blinkAcc -= 1;
        emit({ type: 'blink', t: this.lastEmitT, duration: 120 });
      }
    }
  }
}
