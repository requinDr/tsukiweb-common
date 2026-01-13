import { memo, useEffect, useRef } from "react"
import styles from "../styles/particles.module.scss"

const PARTICLE_COUNT = 40
const PARTICLE_BASE_SIZE = 3
const COLOR = "153, 255, 255"
const MOUSE_RADIUS = 100

interface Particle {
	x: number; y: number; vx: number; vy: number;
	baseSize: number; life: number; vLife: number;
}

/**
 * Interactive particles that react to the mouse and gyro
 */
const Particles = () => {
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const pointer = useRef({ x: -1000, y: -1000 })
	const tilt = useRef(0)
	const particles = useRef<Particle[]>([])
	const dimensions = useRef({ width: 0, height: 0 })
	const raf = useRef<number>(0)

	useEffect(() => {
		const canvas = canvasRef.current
		if (!canvas) return
		const ctx = canvas.getContext("2d", { alpha: true })
		if (!ctx) return

		const initParticle = (first = false): Particle => ({
			x: Math.random() * dimensions.current.width,
			y: dimensions.current.height + (first ? Math.random() * 600 : 20),
			vx: (Math.random() - 0.5) * 0.4,
			vy: -(Math.random() * 0.4 + 0.2),
			baseSize: Math.random() * PARTICLE_BASE_SIZE + 1,
			life: 0,
			vLife: 0.001 + Math.random() * 0.002,
		})

		const onOrientation = (e: DeviceOrientationEvent) => {
			if (e.gamma !== null) tilt.current = e.gamma / 45
		}

		const resize = () => {
			const dpr = Math.min(window.devicePixelRatio || 1, 2)
			const rect = canvas.getBoundingClientRect()
			dimensions.current.width = rect.width
			dimensions.current.height = rect.height
			canvas.width = Math.floor(rect.width * dpr)
			canvas.height = Math.floor(rect.height * dpr)
			ctx.setTransform(1, 0, 0, 1, 0, 0)
			ctx.scale(dpr, dpr)
			particles.current = Array.from({ length: PARTICLE_COUNT }, () => initParticle(true))
		}

		const onPointerMove = (e: PointerEvent) => {
			const rect = canvas.getBoundingClientRect()
			pointer.current.x = e.clientX - rect.left
			pointer.current.y = e.clientY - rect.top
		}

		// Only listen to device orientation if permission is not required
		// don't want to disrupt the user experience with a permission prompt
		if (typeof (DeviceOrientationEvent as any).requestPermission !== 'function') {
			window.addEventListener("deviceorientation", onOrientation)
		}

		resize()
		window.addEventListener("resize", resize)
		window.addEventListener("pointermove", onPointerMove)

		const draw = () => {
			ctx.clearRect(0, 0, dimensions.current.width, dimensions.current.height)

			for (let i = 0; i < particles.current.length; i++) {
				const p = particles.current[i]
				const dx = pointer.current.x - p.x
				const dy = pointer.current.y - p.y
				const distSq = dx * dx + dy * dy

				if (distSq < MOUSE_RADIUS * MOUSE_RADIUS) {
					const force = (MOUSE_RADIUS - Math.sqrt(distSq)) / MOUSE_RADIUS
					p.x -= dx * force * 0.05
					p.y -= dy * force * 0.05
				}

				p.x += p.vx + tilt.current
				p.y += p.vy
				p.life += p.vLife

				if (p.y < -20 || p.life > 1) {
					particles.current[i] = initParticle()
					continue
				}

				let alpha = 1
				if (p.life < 0.1) alpha = p.life / 0.1
				else if (p.life > 0.8) alpha = 1 - (p.life - 0.8) / 0.2

				const opacity = Math.max(0, alpha * 0.6)
				const size = p.baseSize * (Math.sin(p.life * 10) * 0.4 + 1)

				ctx.beginPath()
				ctx.arc(p.x, p.y, size, 0, Math.PI * 2)
				ctx.fillStyle = `rgba(${COLOR}, ${opacity})`
				ctx.fill()
			}
			raf.current = requestAnimationFrame(draw)
		}

		raf.current = requestAnimationFrame(draw)

		return () => {
			cancelAnimationFrame(raf.current)
			window.removeEventListener("resize", resize)
			window.removeEventListener("pointermove", onPointerMove)
			window.removeEventListener("deviceorientation", onOrientation)
		}
	}, [])

	return <canvas ref={canvasRef} className={styles.particles} style={{ opacity: 0.6 }} />
}

export default memo(Particles)