/**
 * The sound palette — seven synthesized cues, no audio files.
 *
 * Physical metaphors, not musical tones: everything here is a *struck object* or
 * a moving surface, built from inharmonic partials with exponential decay (the
 * signature of a real body being hit) plus a noise transient for the impact
 * itself. A sine beep would read as "notification"; a woodblock reads as "that
 * happened".
 *
 * Three loudness tiers, because a palette without a hierarchy is just noise:
 *   - tier 1 (≤0.08 peak) — fires constantly: `tick`, `blip`
 *   - tier 2 (≤0.15 peak) — fires on a deliberate action: `pop`, `whoosh`, `error`
 *   - tier 3 — terminal, once per flow: `thunk`, `bell`
 *
 * Non-negotiables from the spec:
 *   - master gain ≤ 0.3, through a DynamicsCompressor so nothing ever spikes
 *   - ≥ 60ms retrigger throttle per sound
 *   - iOS needs the audio thread warmed by a silent oscillator inside the first
 *     real user gesture, or the first *meaningful* sound is swallowed
 */

export type SoundName = 'tick' | 'thunk' | 'bell' | 'pop' | 'whoosh' | 'blip' | 'error'

const MASTER_GAIN = 0.28
const THROTTLE_MS = 60

let ctx: AudioContext | null = null
/** Every voice connects here: compressor → master trim → speakers. */
let bus: AudioNode | null = null
/** The trim itself, held so `duckMaster` can dip the whole bed under a cue. */
let master: GainNode | null = null
let warmed = false
/** Keyed by throttle key, not by sound: a repeated-step cue can ask for its own
 *  window (see `playSound`) without starving the shared one. */
const lastPlayedAt: Record<string, number> = {}

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext }

function audio(): { ctx: AudioContext; bus: AudioNode } | null {
    if (typeof window === 'undefined') return null
    if (ctx && bus) {
        if (ctx.state === 'suspended') void ctx.resume()
        return { ctx, bus }
    }
    const Ctor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext
    if (!Ctor) return null
    try {
        ctx = new Ctor()
    } catch {
        return null
    }
    // Compressor first, master trim after it: the trim is the hard ceiling, the
    // compressor stops two cues landing on the same frame from clipping.
    const compressor = ctx.createDynamicsCompressor()
    compressor.threshold.value = -18
    compressor.knee.value = 24
    compressor.ratio.value = 8
    compressor.attack.value = 0.002
    compressor.release.value = 0.15

    const trim = ctx.createGain()
    trim.gain.value = MASTER_GAIN

    compressor.connect(trim)
    trim.connect(ctx.destination)
    master = trim
    bus = compressor
    return { ctx, bus }
}

/** How long `duckMaster` needs to get the bed out of the way. Play the cue that
 *  the duck is *for* this many milliseconds after calling it. */
export const DUCK_LEAD_MS = 20

/**
 * Dip the master bus so a terminal cue lands on top of whatever is still ringing.
 *
 * The all-settled bell arrives a beat after a settle thunk, a row collapse and a
 * balance counting down, and the compressor cannot fix that on its own: it pulls
 * *everything* down together, so the bell comes down with the tail it was meant
 * to rise over. Ducking is the mixing-desk answer — take the bed down first, then
 * play the thing that matters.
 *
 * `amount` is the proportion of the master gain to remove (0.55 → down to 45%);
 * `holdMs` is how long it stays there before a slow return, because a fast one is
 * audible in its own right as the room opening back up.
 */
export function duckMaster(amount = 0.55, holdMs = 400): void {
    const a = audio()
    if (!a || !master) return
    const gain = master.gain
    const now = a.ctx.currentTime
    const floor = MASTER_GAIN * (1 - Math.min(Math.max(amount, 0), 1))
    const bottom = now + DUCK_LEAD_MS / 1000
    const release = bottom + holdMs / 1000
    try {
        gain.cancelScheduledValues(now)
        gain.setValueAtTime(gain.value, now)
        gain.linearRampToValueAtTime(floor, bottom)
        gain.setValueAtTime(floor, release)
        gain.linearRampToValueAtTime(MASTER_GAIN, release + 0.6)
    } catch {
        // A mix decision must never take a UI interaction down with it.
    }
}

/**
 * Call inside the first real user gesture (a tap). Creates the context and runs
 * a truly silent oscillator through it — iOS only unlocks the audio thread from
 * inside a gesture, and it will not unlock on a node with zero connections.
 */
export function warmAudio(): void {
    if (warmed) return
    const a = audio()
    if (!a) return
    warmed = true
    const osc = a.ctx.createOscillator()
    const gain = a.ctx.createGain()
    gain.gain.value = 0
    osc.connect(gain)
    gain.connect(a.bus)
    osc.start()
    osc.stop(a.ctx.currentTime + 0.02)
}

/** Short burst of white noise — the impact transient every struck sound needs. */
function noiseBuffer(context: AudioContext, seconds: number): AudioBuffer {
    const frames = Math.max(1, Math.floor(context.sampleRate * seconds))
    const buffer = context.createBuffer(1, frames, context.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < frames; i += 1) data[i] = Math.random() * 2 - 1
    return buffer
}

interface PartialSpec {
    /** Multiple of the fundamental. Inharmonic on purpose — this is what makes
     *  it a block of wood and not an organ pipe. */
    ratio: number
    gain: number
    decay: number
}

function strike(
    context: AudioContext,
    destination: AudioNode,
    at: number,
    fundamental: number,
    partials: readonly PartialSpec[],
    type: OscillatorType = 'sine'
): void {
    for (const partial of partials) {
        const osc = context.createOscillator()
        const gain = context.createGain()
        osc.type = type
        osc.frequency.value = fundamental * partial.ratio
        gain.gain.setValueAtTime(0.0001, at)
        // 1.5ms attack: fast enough to read as a strike, slow enough not to click.
        gain.gain.exponentialRampToValueAtTime(partial.gain, at + 0.0015)
        gain.gain.exponentialRampToValueAtTime(0.0001, at + partial.decay)
        osc.connect(gain)
        gain.connect(destination)
        osc.start(at)
        osc.stop(at + partial.decay + 0.02)
    }
}

function transient(
    context: AudioContext,
    destination: AudioNode,
    at: number,
    {
        seconds,
        filter,
        q,
        gain: level,
        type = 'bandpass',
    }: { seconds: number; filter: number; q: number; gain: number; type?: BiquadFilterType }
): void {
    const source = context.createBufferSource()
    source.buffer = noiseBuffer(context, seconds)
    const biquad = context.createBiquadFilter()
    biquad.type = type
    biquad.frequency.value = filter
    biquad.Q.value = q
    const gain = context.createGain()
    gain.gain.setValueAtTime(level, at)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds)
    source.connect(biquad)
    biquad.connect(gain)
    gain.connect(destination)
    source.start(at)
    source.stop(at + seconds + 0.02)
}

/**
 * Filtered-noise sweep — the whoosh primitive, and the one thing `transient`
 * cannot do: its bandpass is fixed, so it can only ever be an impact. Here the
 * centre frequency slides while the noise under it swells and dies, which is a
 * surface *moving past you* rather than a surface being hit. A pitch-swept
 * oscillator would be a synthesiser rising; paper has no pitch.
 */
function sweep(
    context: AudioContext,
    destination: AudioNode,
    at: number,
    {
        seconds,
        from,
        to,
        q,
        gain: level,
        peakAt = 0.35,
    }: { seconds: number; from: number; to: number; q: number; gain: number; peakAt?: number }
): void {
    const source = context.createBufferSource()
    source.buffer = noiseBuffer(context, seconds)
    const biquad = context.createBiquadFilter()
    biquad.type = 'bandpass'
    biquad.Q.value = q
    biquad.frequency.setValueAtTime(from, at)
    biquad.frequency.exponentialRampToValueAtTime(to, at + seconds)
    const gain = context.createGain()
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(level, at + seconds * peakAt)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds)
    source.connect(biquad)
    biquad.connect(gain)
    gain.connect(destination)
    source.start(at)
    source.stop(at + seconds + 0.02)
}

const voices: Record<SoundName, (context: AudioContext, out: AudioNode, at: number) => void> = {
    /**
     * Pencil tick — graphite meeting paper. Almost entirely transient: a very
     * short, very tight bandpass noise blip with a whisper of high body under
     * it. Deliberately the quietest thing in the palette; it fires most often.
     */
    tick: (context, out, at) => {
        transient(context, out, at, { seconds: 0.018, filter: 2600, q: 6, gain: 0.5 })
        strike(context, out, at, 1750, [{ ratio: 1, gain: 0.06, decay: 0.03 }])
    },

    /**
     * Wood thunk — a debt landing on the table. Modal ratios of a struck bar
     * (1 : 2.76 : 5.40) over a low, lowpassed knock. Short decay, no ring: wood
     * absorbs, it does not sustain.
     */
    thunk: (context, out, at) => {
        transient(context, out, at, { seconds: 0.05, filter: 420, q: 1.1, gain: 0.75, type: 'lowpass' })
        strike(context, out, at, 196, [
            { ratio: 1, gain: 0.5, decay: 0.16 },
            { ratio: 2.76, gain: 0.18, decay: 0.1 },
            { ratio: 5.4, gain: 0.07, decay: 0.06 },
        ])
    },

    /**
     * Handbell — the all-settled moment. Bell partials (hum, prime, tierce,
     * quint, nominal) with a struck-metal transient and a long tail. Slightly
     * detuned so it beats a little, the way a real bell does.
     */
    bell: (context, out, at) => {
        transient(context, out, at, { seconds: 0.03, filter: 5200, q: 1.4, gain: 0.28 })
        strike(context, out, at, 660, [
            { ratio: 0.5, gain: 0.16, decay: 1.5 },
            { ratio: 1, gain: 0.34, decay: 1.3 },
            { ratio: 1.183, gain: 0.14, decay: 1.0 },
            { ratio: 1.506, gain: 0.11, decay: 0.85 },
            { ratio: 2.004, gain: 0.13, decay: 0.7 },
            { ratio: 2.663, gain: 0.06, decay: 0.45 },
        ])
        // A second, quieter strike a beat later — a bell rung by hand swings back.
        strike(context, out, at + 0.19, 660, [
            { ratio: 1, gain: 0.13, decay: 0.9 },
            { ratio: 2.004, gain: 0.05, decay: 0.5 },
        ])
    },

    /**
     * Pop — someone joins the roster. A cork, not a bubble: fast upward pitch
     * bend on a soft triangle, gone in under 100ms.
     */
    pop: (context, out, at) => {
        const osc = context.createOscillator()
        const gain = context.createGain()
        osc.type = 'triangle'
        osc.frequency.setValueAtTime(190, at)
        osc.frequency.exponentialRampToValueAtTime(460, at + 0.055)
        gain.gain.setValueAtTime(0.0001, at)
        gain.gain.exponentialRampToValueAtTime(0.42, at + 0.008)
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.09)
        osc.connect(gain)
        gain.connect(out)
        osc.start(at)
        osc.stop(at + 0.12)
        transient(context, out, at, { seconds: 0.012, filter: 1800, q: 3, gain: 0.22 })
    },

    /**
     * Whoosh — the link leaving your hands (copy, share). A bandpass sweeping up
     * through the noise floor with a slower counter-sweep under it: two surfaces
     * passing each other, which is what paper actually sounds like. Tier 2, ~150ms
     * — long enough to read as movement, short enough not to become a swoosh.
     */
    whoosh: (context, out, at) => {
        sweep(context, out, at, { seconds: 0.15, from: 620, to: 2600, q: 1.1, gain: 0.13 })
        // Downward while the first goes up, 20ms behind: the body of the slide.
        // Offset on purpose — landing both peaks on one frame is how a paper
        // slide turns into a cymbal.
        sweep(context, out, at + 0.02, { seconds: 0.11, from: 1900, to: 780, q: 0.9, gain: 0.05, peakAt: 0.5 })
    },

    /**
     * Blip — a sheet opening. Tier 1 and then some: under 40ms end to end, peak
     * 0.06, effectively no body. A drawer opens because you asked it to, so the
     * cue only has to acknowledge; anything with more presence becomes the sound
     * you remember the app by, and it should not be this one.
     */
    blip: (context, out, at) => {
        transient(context, out, at, { seconds: 0.012, filter: 3200, q: 8, gain: 0.06 })
        strike(context, out, at, 2400, [{ ratio: 1, gain: 0.05, decay: 0.024 }])
    },

    /**
     * Error — a dull thud, deliberately not a buzzer. A buzzer is a machine
     * telling you off; a heavy thing refusing to move is the room telling you it
     * did not go. Same modal-stack construction as `thunk` but an octave and a
     * bit lower, partials pulled *flat* of the harmonic ratios so nothing in it
     * rings, and a second softer knock behind the first — the double-knock of a
     * door that will not open.
     */
    error: (context, out, at) => {
        transient(context, out, at, { seconds: 0.06, filter: 190, q: 0.9, gain: 0.62, type: 'lowpass' })
        strike(context, out, at, 120, [
            { ratio: 1, gain: 0.4, decay: 0.28 },
            { ratio: 1.93, gain: 0.1, decay: 0.13 },
            { ratio: 3.11, gain: 0.04, decay: 0.07 },
        ])
        strike(context, out, at + 0.085, 116, [{ ratio: 1, gain: 0.16, decay: 0.2 }])
    },
}

/**
 * Play a cue. Silently no-ops when Web Audio is unavailable, when the context
 * refuses to start (no gesture yet), or inside the 60ms retrigger window.
 *
 * `throttleKey` splits that window: a cue fired once per step of a repeating
 * interaction can pass its own key so consecutive steps are not eaten by the
 * shared one. Default is the sound's own name, which is what almost everything
 * wants.
 */
export function playSound(name: SoundName, throttleKey: string = name): void {
    const a = audio()
    if (!a) return
    const now = performance.now()
    const last = lastPlayedAt[throttleKey]
    if (last !== undefined && now - last < THROTTLE_MS) return
    lastPlayedAt[throttleKey] = now
    try {
        voices[name](a.ctx, a.bus, a.ctx.currentTime + 0.001)
    } catch {
        // A dead audio context must never take a UI interaction down with it.
    }
}
