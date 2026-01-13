import fs from 'fs'
import path from 'path'
import { isHexColor, saveSpritesheet, generateFlowchartImage } from './utils.js'
import { logError, logProgress } from '../utils/logging.js'

const IMAGE_FORMAT = 'avif'
const BATCH_SIZE = 90
const THUMB_WIDTH = 108
const THUMB_HEIGHT = 72

const getPath = (img, dir) => img && !isHexColor(img) ? path.join(dir, `${img}.${IMAGE_FORMAT}`) : img

export async function processScenes(scenes, inputDir, outputDir, metaDir, width = THUMB_WIDTH, height = THUMB_HEIGHT) {
	if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })

	// 1. Filter scenes that need processing
	const validScenes = Object.entries(scenes).filter(
		([, sceneData]) => sceneData?.fc?.hasOwnProperty('col') && sceneData?.fc?.graph
	)
	const uniqueThumbs = new Map()
	const sceneToKey = new Map()

	// 2. Identify unique thumbnails
	for (const [name, { fc }] of validScenes) {
		const key = JSON.stringify({ ...fc.graph, bg: fc.graph.bg || '#000000' })
		uniqueThumbs.set(key, null)
		sceneToKey.set(name, key)
	}

	const uniqueCount = uniqueThumbs.size
	const duplicateCount = validScenes.length - uniqueCount
	let processed = 0

	// 3. Generate sprites
	await Promise.all([...uniqueThumbs.keys()].map(async (key) => {
		try {
			const g = JSON.parse(key)
			const buffer = await generateFlowchartImage({
				bg: getPath(g.bg, inputDir),
				l: getPath(g.l, inputDir),
				c: getPath(g.c, inputDir),
				r: getPath(g.r, inputDir),
				monochrome: g.monochrome,
				width, height
			})
			uniqueThumbs.set(key, buffer)
			logProgress(`Generating thumbnails: ${++processed}/${uniqueCount} (${duplicateCount} duplicates)`)
		} catch (e) { logError(`Error processing thumbnail: ${e.message}`) }
	}))

	console.log()
	logProgress('Assembling spritesheets...')

	// 4. Assemble spritesheets and metadata
	const meta = { f: [], s: [], d: [width, height], i: {} }
	const thumbPositions = new Map()
	let currentBatch = []
	const saves = []

	const flushBatch = () => {
		const idx = meta.f.length
		const name = `spritesheet_${idx}`
		meta.f.push(name)
		saves.push(saveSpritesheet([...currentBatch], outputDir, name, width, height).then(res => meta.s[idx] = [res.nw, res.nh]))
		currentBatch = []
	}

	for (const [name] of validScenes) {
		const key = sceneToKey.get(name)
		const buffer = uniqueThumbs.get(key)
		if (!buffer) continue

		if (!thumbPositions.has(key)) {
			currentBatch.push(buffer)
			const bIdx = currentBatch.length - 1
			thumbPositions.set(key, [Math.floor(bIdx / 10) * height, (bIdx % 10) * width, meta.f.length])
			if (currentBatch.length === BATCH_SIZE) flushBatch()
		}
		meta.i[name] = thumbPositions.get(key)
	}

	if (currentBatch.length) flushBatch()
	await Promise.all(saves)

	fs.writeFileSync(path.join(metaDir, 'spritesheet_metadata.json'), JSON.stringify(meta))
	logProgress('Spritesheets assembled.\n')
}