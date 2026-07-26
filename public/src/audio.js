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
    this.masterVolume = 0.35; // Default 35% volume
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

  // --- Helper: Filtered White Noise Generator ---
  playNoise(duration, filterFreq, filterType = 'bandpass', volume = 0.2) {
    if (!this.audioCtx || this.isMuted) return;
    const now = this.audioCtx.currentTime;
    
    const bufferSize = Math.floor(this.audioCtx.sampleRate * duration);
    if (bufferSize <= 0) return;
    const buffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    const noiseNode = this.audioCtx.createBufferSource();
    noiseNode.buffer = buffer;
    
    const filter = this.audioCtx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFreq, now);
    
    const gain = this.audioCtx.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    
    noiseNode.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    
    noiseNode.start(now);
    noiseNode.stop(now + duration);
  }

  // --- 1. Short UI Click Blip ---
  playClick() {
    if (this.isMuted) return;
    this.ensureAudioContext();
    if (!this.audioCtx) return;

    const now = this.audioCtx.currentTime;
    
    // Tactical sine pop
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1100, now);
    osc.frequency.exponentialRampToValueAtTime(250, now + 0.05);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.05);

    // Ultra-short high-pass tick
    this.playNoise(0.015, 6000, 'highpass', 0.12);
  }

  // --- 2. Land Attack Resonant Battle Punch ---
  playAttack() {
    if (this.isMuted) return;
    this.ensureAudioContext();
    if (!this.audioCtx) return;

    const now = this.audioCtx.currentTime;

    // Bass transient thump sweep
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.18);

    gain.gain.setValueAtTime(0.65, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.18);

    // Dirt crunch noise blast
    this.playNoise(0.12, 350, 'bandpass', 0.28);
  }

  // --- 3. Naval Boat Dispatch Splash ---
  playBoat() {
    if (this.isMuted) return;
    this.ensureAudioContext();
    if (!this.audioCtx) return;

    const now = this.audioCtx.currentTime;

    // Water bubbling pitch sweep
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(440, now + 0.25);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.25);

    // Splash noise sweep
    const duration = 0.35;
    const bufferSize = Math.floor(this.audioCtx.sampleRate * duration);
    if (bufferSize <= 0) return;
    const buffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.audioCtx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1500, now);
    filter.frequency.exponentialRampToValueAtTime(300, now + duration);

    const noiseGain = this.audioCtx.createGain();
    noiseGain.gain.setValueAtTime(0.32, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterGain);

    noise.start(now);
    noise.stop(now + duration);
  }

  // --- 4. Interest Income Gold Spark Chime ---
  playInterestChime() {
    if (this.isMuted) return;
    this.ensureAudioContext();
    if (!this.audioCtx) return;

    const now = this.audioCtx.currentTime;
    
    // Arpeggiated pentatonic gold reward chord: E5, A5, B5, E6
    const freqs = [659.25, 880.00, 987.77, 1318.51];
    
    freqs.forEach((f, idx) => {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, now + idx * 0.04);
      
      const noteDelay = idx * 0.04;
      gain.gain.setValueAtTime(0.0, now);
      gain.gain.setValueAtTime(0.2, now + noteDelay);
      gain.gain.exponentialRampToValueAtTime(0.001, now + noteDelay + 0.35);
      
      osc.connect(gain);
      gain.connect(this.masterGain);
      
      osc.start(now + noteDelay);
      osc.stop(now + noteDelay + 0.35);
    });
  }

  // --- 5. Match Victory Glorious Fanfare (Polyphonic Brass Chords) ---
  playVictoryFanfare() {
    if (this.isMuted) return;
    this.ensureAudioContext();
    if (!this.audioCtx) return;

    const now = this.audioCtx.currentTime;

    // Progression of major triads: C major -> G major -> C major (high)
    const chords = [
      { time: 0.0, freqs: [261.63, 329.63, 392.00], duration: 0.25 }, // C4, E4, G4
      { time: 0.25, freqs: [293.66, 392.00, 493.88], duration: 0.25 }, // D4, G4, B4
      { time: 0.5, freqs: [329.63, 415.30, 493.88], duration: 0.30 }, // E4, G#4, B4
      { time: 0.8, freqs: [523.25, 659.25, 783.99, 1046.50], duration: 0.80 } // Triumphant C5, E5, G5, C6
    ];

    chords.forEach((chord) => {
      const chordTime = now + chord.time;
      chord.freqs.forEach((f) => {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        // Lowpass filter to make the sawtooth wave sound like warm brass horns
        const filter = this.audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1000, chordTime);

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f, chordTime);

        gain.gain.setValueAtTime(0.0, now);
        gain.gain.setValueAtTime(0.14, chordTime);
        gain.gain.exponentialRampToValueAtTime(0.001, chordTime + chord.duration);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        osc.start(chordTime);
        osc.stop(chordTime + chord.duration);
      });
    });
  }

  // --- 6. Match Defeat Dark Cinematic Stinger ---
  playDefeatStinger() {
    if (this.isMuted) return;
    this.ensureAudioContext();
    if (!this.audioCtx) return;

    const now = this.audioCtx.currentTime;

    // Descending brass drone minor triads: A minor -> E minor
    const chords = [
      { time: 0.0, freqs: [220.00, 261.63, 329.63], duration: 0.35 }, // A3, C4, E4
      { time: 0.35, freqs: [196.00, 233.08, 293.66], duration: 0.35 }, // G3, Bb3, D4
      { time: 0.7, freqs: [164.81, 196.00, 246.94, 329.63], duration: 1.20 } // E3, G3, B3, E4 minor stinger
    ];

    chords.forEach((chord) => {
      const chordTime = now + chord.time;
      chord.freqs.forEach((f) => {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        const filter = this.audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(550, chordTime);

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f, chordTime);

        gain.gain.setValueAtTime(0.0, now);
        gain.gain.setValueAtTime(0.20, chordTime);
        gain.gain.exponentialRampToValueAtTime(0.001, chordTime + chord.duration);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        osc.start(chordTime);
        osc.stop(chordTime + chord.duration);
      });
    });

    // Dark rumble noise sweep
    this.playNoise(1.2, 140, 'lowpass', 0.20);
  }

  // --- 7. Player Elimination Heavy Metal Strike / Gong ---
  playElimination() {
    if (this.isMuted) return;
    this.ensureAudioContext();
    if (!this.audioCtx) return;

    const now = this.audioCtx.currentTime;

    // Heavy resonant gong tone (detuned triangle + sawtooth)
    const osc1 = this.audioCtx.createOscillator();
    const osc2 = this.audioCtx.createOscillator();
    const gain1 = this.audioCtx.createGain();
    const gain2 = this.audioCtx.createGain();

    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(120, now);
    osc1.frequency.linearRampToValueAtTime(70, now + 0.5);
    gain1.gain.setValueAtTime(0.4, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(125, now);
    osc2.frequency.linearRampToValueAtTime(65, now + 0.5);
    gain2.gain.setValueAtTime(0.4, now);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    osc1.connect(gain1);
    gain1.connect(this.masterGain);
    osc2.connect(gain2);
    gain2.connect(this.masterGain);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.5);
    osc2.stop(now + 0.5);

    // Resonant lowpass noise gong rumble
    this.playNoise(0.4, 180, 'lowpass', 0.35);
  }
}
