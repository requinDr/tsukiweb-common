import fs from 'fs'
import path from 'path'
import { isHexColor, saveSpritesheet, generateThumbnail } from './utils.ts'
import { logger } from '../utils/logger.ts'

interface SceneGraph {
  bg?:         string
  l?:          string
  c?:          string
  r?:          string
  monochrome?: string
}

export interface Scene {
  graph: SceneGraph
}

interface SpritesheetMeta {
  f: string[]
  s: Array<[number, number]>
  d: [number, number]
  i: Record<string, [number, number, number]>
}

const IMAGE_FORMAT = 'avif'
const BATCH_SIZE = 90
const THUMB_WIDTH = 108
const THUMB_HEIGHT = 72

const getPath = (img: string | undefined, dir: string) =>
  img && !isHexColor(img) ? path.join(dir, `${img}.${IMAGE_FORMAT}`) : img

export async function buildSpritesheets(
  scenes: Array<[string, Scene]>,
  inputDir: string,
  outputDir: string,
  metaDir: string,
  width = THUMB_WIDTH, height = THUMB_HEIGHT
) {
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })

  const uniqueThumbs = new Map<string, Buffer | null>()
  const sceneToKey = new Map<string, string>()

  // 1. Identify unique thumbnails
  for (const [name, { graph }] of scenes) {
    const key = JSON.stringify({ ...graph, bg: graph.bg || '#000000' })
    uniqueThumbs.set(key, null)
    sceneToKey.set(name, key)
  }

  const uniqueCount = uniqueThumbs.size
  const duplicateCount = scenes.length - uniqueCount
  let processed = 0

  // 2. Generate sprites
  await Promise.all([...uniqueThumbs.keys()].map(async (key) => {
    try {
      const g = JSON.parse(key)
      const buffer = await generateThumbnail({
        bg: getPath(g.bg, inputDir),
        l: getPath(g.l, inputDir),
        c: getPath(g.c, inputDir),
        r: getPath(g.r, inputDir),
        monochrome: g.monochrome,
        width, height
      })
      uniqueThumbs.set(key, buffer)
      logger.progress(`Generating thumbnails: ${++processed}/${uniqueCount} (${duplicateCount} duplicates)`)
    } catch (e) {
      logger.error(`Error processing thumbnail: ${(e as Error).message}`)
    }
  }))

  logger.log('Assembling spritesheets...')

  // 3. Assemble spritesheets and metadata
  const meta: SpritesheetMeta = { f: [], s: [], d: [width, height], i: {} }
  const thumbPositions = new Map<string, [number, number, number]>()
  let currentBatch: Buffer[] = []
  const saves: Promise<unknown>[] = []

  const flushBatch = () => {
    const idx = meta.f.length
    const name = `spritesheet_${idx}`
    meta.f.push(name)
    saves.push(
      saveSpritesheet([...currentBatch], outputDir, name, width, height)
        .then(res => meta.s[idx] = [res.nw, res.nh])
    )
    currentBatch = []
  }

  for (const [name] of scenes) {
    const key = sceneToKey.get(name)
    if (!key) continue

    const buffer = uniqueThumbs.get(key)
    if (!buffer) continue

    if (!thumbPositions.has(key)) {
      currentBatch.push(buffer)
      const bIdx = currentBatch.length - 1
      thumbPositions.set(key, [Math.floor(bIdx / 10) * height, (bIdx % 10) * width, meta.f.length])
      if (currentBatch.length === BATCH_SIZE) flushBatch()
    }
    meta.i[name] = thumbPositions.get(key)!
  }

  if (currentBatch.length) flushBatch()
  await Promise.all(saves)

  fs.writeFileSync(path.join(metaDir, 'spritesheet_metadata.json'), JSON.stringify(meta))
  logger.log(`Spritesheets assembled (${meta.f.length}).`)
}
