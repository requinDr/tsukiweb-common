import { useRef, useEffect, useState, memo } from 'react'
import styles from "../styles/particles.module.scss"

interface Snowflake {
	x: number
	y: number
	radius: number
	speed: number
	wind: number
	opacity: number
	angle: number
}

type Props = {
	density?: number
	speedMultiplier?: number
}

const SnowfallCanvas = ({ density = 100, speedMultiplier = 1}: Props) => {
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight })

	useEffect(() => {
		const handleResize = () => {
			setDimensions({ width: window.innerWidth, height: window.innerHeight })
		}
		window.addEventListener('resize', handleResize)
		return () => window.removeEventListener('resize', handleResize)
	}, [])

	useEffect(() => {
		const canvas = canvasRef.current
		if (!canvas) return

		const ctx = canvas.getContext('2d')
		if (!ctx) return

		canvas.width = dimensions.width
		canvas.height = dimensions.height

		const flakes: Snowflake[] = []
		for (let i = 0; i < density; i++) {
			flakes.push(createFlake(dimensions.width, dimensions.height))
		}

		let animationFrameId: number

		const render = () => {
			ctx.clearRect(0, 0, canvas.width, canvas.height)
			
			ctx.fillStyle = '#FFFFFF'

			flakes.forEach((flake) => {
				flake.angle += 0.01
				flake.y += flake.speed * speedMultiplier
				flake.x += Math.sin(flake.angle) * flake.wind + (flake.wind * 0.5) 

				if (flake.y > canvas.height) {
					flake.y = -flake.radius
					flake.x = Math.random() * canvas.width
				}
				if (flake.x > canvas.width + 5) {
					flake.x = -5
				} else if (flake.x < -5) {
					flake.x = canvas.width + 5
				}

				ctx.beginPath()
				ctx.globalAlpha = flake.opacity
				ctx.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2)
				ctx.fill()
			})

			animationFrameId = requestAnimationFrame(render)
		}

		render()

		return () => {
			cancelAnimationFrame(animationFrameId)
		}
	}, [dimensions, density, speedMultiplier])

	return (
		<canvas 
			ref={canvasRef} 
			className={styles.snowfall}
		/>
	)
}


const createFlake = (width: number, height: number): Snowflake => {
	return {
		x: Math.random() * width,
		y: Math.random() * height,
		radius: Math.random() * 2 + 0.5,
		speed: Math.random() * 0.5 + 0.2,
		wind: (Math.random() - 0.5) * 0.5,
		opacity: Math.random() * 0.5 + 0.3,
		angle: Math.random() * Math.PI * 2
	}
}

export default memo(SnowfallCanvas)
