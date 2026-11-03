let ctx: AudioContext | null = null

/** Two-tone synthesized notification chime (Web Audio, no assets). */
export function playChime(): void {
  try {
    const AudioCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtor) return
    if (!ctx) ctx = new AudioCtor()
    if (ctx.state === 'suspended') void ctx.resume()

    const now = ctx.currentTime
    const master = ctx.createGain()
    master.gain.value = 0.0001
    master.connect(ctx.destination)
    master.gain.setValueAtTime(0.0001, now)
    master.gain.exponentialRampToValueAtTime(0.09, now + 0.02)
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.75)

    const tones = [
      { f: 880, t: 0 },
      { f: 1320, t: 0.13 },
    ]
    tones.forEach(({ f, t }) => {
      const osc = ctx!.createOscillator()
      const g = ctx!.createGain()
      osc.type = 'triangle'
      osc.frequency.value = f
      g.gain.setValueAtTime(0.0001, now + t)
      g.gain.exponentialRampToValueAtTime(0.6, now + t + 0.015)
      g.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.4)
      osc.connect(g)
      g.connect(master)
      osc.start(now + t)
      osc.stop(now + t + 0.45)
    })
  } catch {
    /* audio blocked — reminders stay visual */
  }
}
