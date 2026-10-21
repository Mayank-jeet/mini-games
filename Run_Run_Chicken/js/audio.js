/* ==========================================================
   js/audio.js  -  all sound, synthesized live (no audio files).

   WHY IT EXISTS
   Browsers refuse to play sound until the player has touched the
   page, and shipping audio files would add weight and licensing
   questions. So every effect and the background tune are built
   from Web Audio oscillators and noise bursts. This module only
   needs two calls from the rest of the game: Snd.play(name) and
   Snd.music(worldIndex).

   API  (global: Snd)
     Snd.unlock()            call from a user gesture; creates the AudioContext
     Snd.play("jump" ...)    one-shot effects (respects the Sound Effects toggle)
     Snd.music(world)        start/switch the looping tune for a season
     Snd.setMusic(bool) / Snd.setSfx(bool)   the settings toggles
     Snd.duck(bool)          quiet the music (used while paused)
   ========================================================== */
const Snd = (() => {
    let ctx = null, master = null, musicGain = null, noiseBuf = null;
    let sfxOn = true, musicOn = true, ducked = false;
    let world = 0, timer = null, nextTime = 0, step = 0, melodyIdx = 3;

    /* A tune per season: tempo, scale (semitones above the root) and root note (Hz). */
    const TUNES = [
        { bpm: 132, root: 261.63, scale: [0, 2, 4, 7, 9] },     // Summer: bright major pentatonic
        { bpm: 98,  root: 220.0,  scale: [0, 3, 5, 7, 10] },    // Winter: calm minor pentatonic
        { bpm: 112, root: 233.08, scale: [0, 2, 3, 7, 9] },     // Monsoon: moody, dorian-ish
    ];

    function unlock() {
        if (ctx) { if (ctx.state === "suspended") ctx.resume(); return; }
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
        musicGain = ctx.createGain(); musicGain.connect(master);
        applyMusicGain();
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        if (musicOn) startMusic();
    }

    function applyMusicGain() {
        if (musicGain) musicGain.gain.setTargetAtTime(musicOn ? (ducked ? 0.25 : 1) * 0.16 : 0, ctx.currentTime, 0.05);
    }

    /* One enveloped oscillator note; freq can glide to `to`. */
    function tone(freq, type, dur, vol, to, delay, dest) {
        if (!ctx) return;
        const t0 = ctx.currentTime + (delay || 0);
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type; o.frequency.setValueAtTime(freq, t0);
        if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(g); g.connect(dest || master);
        o.start(t0); o.stop(t0 + dur + 0.05);
    }
    function noise(dur, vol, freq, delay, dest) {
        if (!ctx) return;
        const t0 = ctx.currentTime + (delay || 0);
        const s = ctx.createBufferSource(); s.buffer = noiseBuf;
        const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq; f.Q.value = 0.9;
        const g = ctx.createGain();
        g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        s.connect(f); f.connect(g); g.connect(dest || master);
        s.start(t0); s.stop(t0 + dur + 0.05);
    }

    const SFX = {
        click:  () => tone(620, "square", 0.06, 0.07),
        jump:   () => tone(360, "square", 0.14, 0.10, 760),
        flap:   () => { noise(0.09, 0.10, 1800); tone(520, "sine", 0.09, 0.05, 330); },
        land:   () => tone(130, "sine", 0.1, 0.12, 60),
        coin:   () => { tone(988, "square", 0.07, 0.07); tone(1319, "square", 0.12, 0.07, null, 0.06); },
        gem:    () => [784, 988, 1175, 1568].forEach((f, k) => tone(f, "triangle", 0.14, 0.11, null, k * 0.06)),
        power:  () => [523, 659, 784, 1047].forEach((f, k) => tone(f, "square", 0.1, 0.08, null, k * 0.05)),
        hurt:   () => { tone(320, "sawtooth", 0.35, 0.14, 70); noise(0.2, 0.1, 500); },
        shield: () => { noise(0.25, 0.14, 2500); tone(900, "triangle", 0.2, 0.08, 300); },
        thud:   () => { tone(180, "sine", 0.14, 0.12, 70); noise(0.08, 0.06, 1200); },
        flag:   () => [659, 880].forEach((f, k) => tone(f, "triangle", 0.14, 0.1, null, k * 0.09)),
        win:    () => [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, k) => tone(f, "triangle", 0.2, 0.12, null, k * 0.11)),
        lose:   () => [392, 330, 262, 196].forEach((f, k) => tone(f, "sawtooth", 0.3, 0.09, null, k * 0.18)),
    };
    function play(name) {
        if (!sfxOn || !ctx) return;
        if (SFX[name]) SFX[name]();
    }

    /* ----- background music: a tiny step sequencer scheduled slightly ahead of the clock ----- */
    function scheduleStep(time) {
        const T = TUNES[world], beat = 60 / T.bpm / 2;      // eighth notes
        const hz = (deg, oct) => T.root * Math.pow(2, (T.scale[deg % 5] + 12 * (oct + Math.floor(deg / 5))) / 12);
        const play1 = (f, type, dur, vol, at) => {
            const o = ctx.createOscillator(), g = ctx.createGain();
            o.type = type; o.frequency.value = f;
            g.gain.setValueAtTime(0.0001, at);
            g.gain.exponentialRampToValueAtTime(vol, at + 0.015);
            g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
            o.connect(g); g.connect(musicGain); o.start(at); o.stop(at + dur + 0.05);
        };
        const s16 = step % 16;
        if (s16 % 8 === 0) play1(hz(0, -1), "triangle", beat * 3.6, 0.9, time);            // bass on beats 1 and 3
        if (s16 % 8 === 4) play1(hz(2, -1), "triangle", beat * 3.0, 0.7, time);
        if (Math.random() < 0.72) {                                                        // wandering melody
            melodyIdx = Math.max(0, Math.min(9, melodyIdx + (Math.floor(Math.random() * 5) - 2)));
            play1(hz(melodyIdx, 1), "square", beat * 1.6, 0.28, time);
        }
        if (s16 % 2 === 1) {                                                               // soft hat
            const s = ctx.createBufferSource(); s.buffer = noiseBuf;
            const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 6000;
            const g = ctx.createGain(); g.gain.setValueAtTime(0.18, time); g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
            s.connect(f); f.connect(g); g.connect(musicGain); s.start(time); s.stop(time + 0.06);
        }
        step++;
        return beat;
    }
    function tick() {
        if (!ctx) return;
        while (nextTime < ctx.currentTime + 0.25) nextTime += scheduleStep(nextTime);
    }
    function startMusic() {
        if (!ctx || timer) return;
        nextTime = ctx.currentTime + 0.05;
        timer = setInterval(tick, 60);
    }
    function stopMusic() { if (timer) { clearInterval(timer); timer = null; } }

    return {
        unlock,
        play,
        music(w) { world = w; melodyIdx = 3; if (ctx && musicOn) startMusic(); },
        setMusic(on) { musicOn = on; if (ctx) { applyMusicGain(); on ? startMusic() : stopMusic(); } },
        setSfx(on) { sfxOn = on; },
        duck(on) { ducked = on; if (ctx) applyMusicGain(); },
    };
})();
