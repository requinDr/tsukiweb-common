import { memo, useEffect, useRef } from "react"
import styles from "../styles/particles.module.scss"

const PARTICLE_COUNT = 50
const PARTICLE_BASE_SIZE = 8
const PARTICLE_COLOR = { h: 180, s: 100, l: 80 }

interface Particle {
	size: number
	fromX: number
	toX: number
	startY: number
	endY: number
	moveDuration: number
	moveDelay: number
	scaleDelay: number
	startTime: number
}

function createParticle(): Particle {
	const size = Math.floor(Math.random() * PARTICLE_BASE_SIZE) + 1
	const startY = 100 + Math.random() * 10
	const endOvershoot = 10 + Math.random() * 20
	const fromX = Math.random() * 100
	const deltaX = Math.random() * 30 - 15
	const toX = Math.max(0, Math.min(100, fromX + deltaX))

	const oldTopOvershoot = Math.random() * 30
	const oldLen = startY + (startY + oldTopOvershoot)
	const newLen = startY + endOvershoot
	const baseDuration = 22000 + Math.random() * 7000
	const moveDuration = baseDuration * (newLen / oldLen)

	return {
		size,
		fromX,
		toX,
		startY,
		endY: endOvershoot,
		moveDuration,
		moveDelay: Math.random() * 37000,
		scaleDelay: Math.random() * 4000,
		startTime: 0,
	}
}

function getScale(time: number, scaleDelay: number): number {
	const scaleDuration = 2000
	const adjustedTime = Math.max(0, time - scaleDelay)
	const cycleTime = adjustedTime % scaleDuration
	const t = cycleTime / scaleDuration

	// 0% -> 0.4, 50% -> 2.2, 100% -> 0.4
	if (t < 0.5) {
		return 0.4 + (2.2 - 0.4) * (t / 0.5)
	} else {
		return 2.2 - (2.2 - 0.4) * ((t - 0.5) / 0.5)
	}
}

function getMaskAlpha(yPercent: number): number {
	// Mask: linear-gradient(to top, black 0%, transparent 60%)
	// At y=100% (bottom), alpha=1; at y=40% and above, alpha=0
	if (yPercent >= 100) return 1
	if (yPercent <= 40) return 0
	return (yPercent - 40) / 60
}

const Particles = () => {
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const particlesRef = useRef<Particle[]>([])
	const animationRef = useRef<number>(0)
	const reducedMotionRef = useRef(false)

	useEffect(() => {
		const canvas = canvasRef.current
		if (!canvas) return

		const ctx = canvas.getContext("2d", { alpha: true })
		if (!ctx) return

		const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
		reducedMotionRef.current = mediaQuery.matches

		const handleMotionChange = (e: MediaQueryListEvent) => {
			reducedMotionRef.current = e.matches
		}
		mediaQuery.addEventListener("change", handleMotionChange)

		particlesRef.current = Array.from({ length: PARTICLE_COUNT }, createParticle)

		const handleResize = () => {
			const dpr = window.devicePixelRatio || 1
			const rect = canvas.getBoundingClientRect()
			canvas.width = rect.width * dpr
			canvas.height = rect.height * dpr
			ctx.scale(dpr, dpr)
		}

		handleResize()
		window.addEventListener("resize", handleResize)

		let startTime: number | null = null

		const draw = (timestamp: number) => {
			if (reducedMotionRef.current) {
				return
			}

			if (startTime === null) {
				startTime = timestamp
				// Initialize particle start times
				particlesRef.current.forEach((p) => {
					p.startTime = timestamp + p.moveDelay
				})
			}

			const rect = canvas.getBoundingClientRect()
			ctx.clearRect(0, 0, rect.width, rect.height)

			// Set blend mode for screen effect
			ctx.globalCompositeOperation = "screen"

			particlesRef.current.forEach((particle) => {
				const elapsed = timestamp - particle.startTime

				if (elapsed < 0) {
					// Particle hasn't started yet
					return
				}

				// Calculate progress (0 to 1) with looping
				const cycleTime = elapsed % particle.moveDuration
				const progress = cycleTime / particle.moveDuration

				// Calculate position
				const xPercent = particle.fromX + (particle.toX - particle.fromX) * progress
				const yPercent = particle.startY + (particle.endY - particle.startY) * progress

				const x = (xPercent / 100) * rect.width
				const y = (yPercent / 100) * rect.height

				// Calculate scale
				const scale = getScale(elapsed, particle.scaleDelay)
				const scaledSize = particle.size * scale

				// Alpha mask based on Y position
				const maskAlpha = getMaskAlpha((yPercent / 100) * 100)
				if (maskAlpha <= 0) return

				const gradient = ctx.createRadialGradient(x, y, 0, x, y, scaledSize)
				const { h, s, l } = PARTICLE_COLOR

				gradient.addColorStop(0, `hsla(${h}, ${s}%, ${l}%, ${maskAlpha})`)
				gradient.addColorStop(0.1, `hsla(${h}, ${s}%, ${l}%, ${maskAlpha})`)
				gradient.addColorStop(0.56, `hsla(${h}, ${s}%, ${l}%, 0)`)
				gradient.addColorStop(1, `hsla(${h}, ${s}%, ${l}%, 0)`)

				ctx.beginPath()
				ctx.arc(x, y, scaledSize, 0, Math.PI * 2)
				ctx.fillStyle = gradient
				ctx.fill()
			})

			animationRef.current = requestAnimationFrame(draw)
		}

		animationRef.current = requestAnimationFrame(draw)

		return () => {
			cancelAnimationFrame(animationRef.current)
			window.removeEventListener("resize", handleResize)
			mediaQuery.removeEventListener("change", handleMotionChange)
		}
	}, [])

	return (
		<canvas
			ref={canvasRef}
			className={styles.particles}
		/>
	)
}

export default memo(Particles)