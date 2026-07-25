/**
 * WebAudio Real-Time Sound Synthesizer Engine for Terra.
 * Generates procedural sound effects (attacks, boat splashes, interest chimes, fanfares)
 * with zero external audio file dependencies.
 */

export class SoundEngine {
  constructor() {
    this.audioCtx = null;
    this.masterGain = null;
    this.isMuted = false;
    this.masterVolume = 0.3; // Default 30% volume
  }

  init() {
    if (this.audioCtx) return;
    try {
      if (typeof window !== 'undefined') {
        const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
        if (AudioCtxClass) {
          this.audioCtx = new AudioCtxClass();
          this.masterGain = this.audioCtx.createGain();
          this.masterGain.gain.value = this.isMuted ? 0 : this.masterVolume;
          this.masterGain.connect(this.audioCtx.destination);
        }
      }
    } catch (e) {
      // Quiet fallback for headless unit tests
    }
  }

  ensureAudioContext() {
    if (!this.audioCtx) this.init();
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.masterGain) {
      this.masterGain.gain.value = this.isMuted ? 0 : this.masterVolume;
    }
    return this.isMuted;
  }

  setVolume(vol) {
    this.masterVolume = Math.max(0, Math.min(1.0, vol));
    if (this.masterGain && !this.isMuted) {
      this.masterGain.gain.value = this.masterVolume;
    }
  }

  // --- 1. Short UI Click Blip ---
  playClick() {
    if (this.isMuted) return;
    this.ensureAudioContext();
    if (!this.audioCtx) return;

    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = 'sine';
    const now = this.audioCtx.currentTime;
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.035);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.035);
  }

  // --- 2. Land Attack Resonant Punch ---
  playAttack() {
    if (this.isMuted) return;
    this.ensureAudioContext();
    if (!this.audioCtx) return;

    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = 'triangle';
    const now = this.audioCtx.currentTime;
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.12);

    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.12);
  }

  // --- 3. Naval Boat Dispatch Splash ---
  playBoat() {
    if (this.isMuted) return;
    this.ensureAudioContext();
    if (!this.audioCtx) return;

    const now = this.audioCtx.currentTime;

    // Sine pitch sweep
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(650, now + 0.2);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.2);
  }

  // --- 4. Interest Income Harmonic Chime Chord ---
  playInterestChime() {
    if (this.isMuted) return;
    this.ensureAudioContext();
    if (!this.audioCtx) return;

    const freqs = [523.25, 659.25, 783.99]; // C5, E5, G5 chord
    const now = this.audioCtx.currentTime;

    freqs.forEach((f, idx) => {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now + idx * 0.02);

      gain.gain.setValueAtTime(0.2, now + idx * 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now + idx * 0.02);
      osc.stop(now + 0.25);
    });
  }

  // --- 5. Match Victory Fanfare ---
  playVictoryFanfare() {
    if (this.isMuted) return;
    this.ensureAudioContext();
    if (!this.audioCtx) return;

    const notes = [
      { f: 523.25, duration: 0.12 }, // C5
      { f: 659.25, duration: 0.12 }, // E5
      { f: 783.99, duration: 0.12 }, // G5
      { f: 1046.50, duration: 0.4 }  // C6
    ];

    let startTime = this.audioCtx.currentTime;
    notes.forEach((note) => {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(note.f, startTime);

      gain.gain.setValueAtTime(0.4, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + note.duration);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(startTime);
      osc.stop(startTime + note.duration);

      startTime += note.duration * 0.9;
    });
  }

  // --- 6. Match Defeat Minor Stinger ---
  playDefeatStinger() {
    if (this.isMuted) return;
    this.ensureAudioContext();
    if (!this.audioCtx) return;

    const now = this.audioCtx.currentTime;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.5);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.5);
  }
}
