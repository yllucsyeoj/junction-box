import { resolve } from 'node:path'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { initDb, upsertPatch } from '../server/db'

const DATA_DIR = process.env.GONUDE_DATA_DIR ?? resolve(import.meta.dir, '..', 'data')
const PATCHES_DIR = resolve(DATA_DIR, 'patches')

async function migrate() {
  console.log('Starting patch migration...')
  console.log(`Data dir: ${DATA_DIR}`)
  console.log(`Patches dir: ${PATCHES_DIR}`)

  initDb(resolve(DATA_DIR, 'junction-box.db'))

  if (!existsSync(PATCHES_DIR)) {
    console.log('No patches directory found, nothing to migrate.')
    return
  }

  const files = readdirSync(PATCHES_DIR).filter(f => f.endsWith('.json'))
  console.log(`Found ${files.length} patch files to migrate.`)

  let migrated = 0
  let skipped = 0

  for (const file of files) {
    const alias = file.replace('.json', '')
    const filePath = resolve(PATCHES_DIR, file)
    
    try {
      const content = readFileSync(filePath, 'utf8')
      const record = JSON.parse(content)
      
      if (!record.alias || !record.graph) {
        console.warn(`Skipping ${file}: missing alias or graph`)
        skipped++
        continue
      }

      upsertPatch(record.alias, record.description ?? '', record.graph)
      migrated++
      console.log(`Migrated: ${alias}`)
    } catch (err) {
      console.error(`Error migrating ${file}:`, err)
      skipped++
    }
  }

  console.log(`\nMigration complete: ${migrated} migrated, ${skipped} skipped.`)
}

migrate()
