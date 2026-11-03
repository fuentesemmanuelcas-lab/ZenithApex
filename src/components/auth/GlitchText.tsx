import React, { useEffect, useState } from 'react'

const SCRAMBLE = '!@#$%^&*()_+-=[]{}|;:,.<>?/ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

/** Decodes text character by character, terminal-cipher style. */
export function GlitchText({
  text,
  className = '',
  delay = 0,
}: {
  text: string
  className?: string
  delay?: number
}) {
  const [display, setDisplay] = useState(text)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(text)
      return
    }
    let interval = 0
    setDisplay('')
    const start = window.setTimeout(() => {
      let iteration = 0
      interval = window.setInterval(() => {
        setDisplay(
          text
            .split('')
            .map((char, i) =>
              i < iteration ? text[i] : char === ' ' ? ' ' : SCRAMBLE[Math.floor(Math.random() * SCRAMBLE.length)],
            )
            .join(''),
        )
        if (iteration >= text.length) window.clearInterval(interval)
        iteration += 0.6
      }, 28)
    }, delay * 1000)
    return () => {
      window.clearTimeout(start)
      window.clearInterval(interval)
    }
  }, [text, delay])

  return (
    <span className={className} aria-label={text}>
      <span aria-hidden>{display || '\u00a0'}</span>
    </span>
  )
}
