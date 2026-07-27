/**
 * The sound palette — four synthesized cues, no audio files.
 *
 * Physical metaphors, not musical tones: everything here is a *struck object*,
 * built from inharmonic partials with exponential decay (the signature of a
 * real body being hit) plus a noise transient for the impact itself. A sine
 * beep would read as "notification"; a woodblock reads as "that happened".
 *
 * Non-negotiables from the spec:
 *   - master gain ≤ 0.3, through a DynamicsCompressor so nothing ever spikes
 *   - ≥ 60ms retrigger throttle per sound
 *   - iOS needs the audio thread warmed by a silent oscillator inside the first
 *     real user gesture, or the first *meaningful* sound is swallowed
 */

export type SoundName = 'tick' | 'thunk' | 'bell' | 'pop'

const MASTER_GAIN = 0.28
const THROTTLE_MS = 60

let ctx: AudioContext | null = null
/** Every voice connects here: compressor → master trim → speakers. */
let bus: AudioNode | null = null
let warmed = false
const lastPlayedAt: Partial<Record<SoundName, number>> = {}

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

    const master = ctx.createGain()
    master.gain.value = MASTER_GAIN

    compressor.connect(master)
    master.connect(ctx.destination)
    bus = compressor
    return { ctx, bus }
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
}

/**
 * Play a cue. Silently no-ops when Web Audio is unavailable, when the context
 * refuses to start (no gesture yet), or inside the 60ms retrigger window.
 */
export function playSound(name: SoundName): void {
    const a = audio()
    if (!a) return
    const now = performance.now()
    const last = lastPlayedAt[name]
    if (last !== undefined && now - last < THROTTLE_MS) return
    lastPlayedAt[name] = now
    try {
        voices[name](a.ctx, a.bus, a.ctx.currentTime + 0.001)
    } catch {
        // A dead audio context must never take a UI interaction down with it.
    }
}
