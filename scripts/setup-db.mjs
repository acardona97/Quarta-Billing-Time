#!/usr/bin/env node
/**
 * QUARTA BILLING TIME — Database Setup Script
 *
 * Usage:
 *   node scripts/setup-db.mjs <database_password>
 *
 * This script connects to your Supabase PostgreSQL database and runs:
 *   1. 001_initial_schema.sql — All tables, indexes, triggers
 *   2. 002_rls_policies.sql — Row Level Security policies
 *   3. seed.sql — Initial data (users, clients, matters)
 *
 * You need your database password from Supabase Dashboard:
 *   Settings → Database → Connection string → Password
 *
 * Project ref: xwaijwpbxcobfpwmarkl
 */

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const PROJECT_REF = 'xwaijwpbxcobfpwmarkl'
const DB_HOST = `aws-0-us-east-1.pooler.supabase.com`
const DB_PORT = 5432
const DB_NAME = 'postgres'
const DB_USER = `postgres.${PROJECT_REF}`

async function main() {
  const password = process.argv[2]

  if (!password) {
    console.error(`
╔══════════════════════════════════════════════════════╗
║  QUARTA BILLING TIME — Setup de Base de Datos       ║
╠══════════════════════════════════════════════════════╣
║                                                      ║
║  Uso: node scripts/setup-db.mjs <DB_PASSWORD>       ║
║                                                      ║
║  Obtén tu password de Supabase Dashboard:           ║
║  → supabase.com/dashboard                           ║
║  → Tu proyecto → Settings → Database               ║
║  → Connection string → Password                    ║
║                                                      ║
╚══════════════════════════════════════════════════════╝
`)
    process.exit(1)
  }

  // Dynamic import pg
  let pg
  try {
    pg = await import('pg')
  } catch (e) {
    console.log('Installing pg package...')
    const { execSync } = await import('child_process')
    execSync('npm install pg --save-dev', { stdio: 'inherit' })
    pg = await import('pg')
  }

  const { Client } = pg.default || pg

  const client = new Client({
    host: DB_HOST,
    port: DB_PORT,
    database: DB_NAME,
    user: DB_USER,
    password: password,
    ssl: { rejectUnauthorized: false },
  })

  try {
    console.log('⏳ Conectando a Supabase PostgreSQL...')
    await client.connect()
    console.log('✅ Conectado!\n')

    // Read migration files
    const migrations = [
      { name: '001_initial_schema', file: join(__dirname, '..', 'supabase', 'migrations', '001_initial_schema.sql') },
      { name: '002_rls_policies', file: join(__dirname, '..', 'supabase', 'migrations', '002_rls_policies.sql') },
      { name: 'seed', file: join(__dirname, '..', 'supabase', 'seed.sql') },
    ]

    for (const migration of migrations) {
      console.log(`⏳ Ejecutando ${migration.name}...`)
      const sql = readFileSync(migration.file, 'utf-8')

      try {
        await client.query(sql)
        console.log(`✅ ${migration.name} completado`)
      } catch (err) {
        console.error(`❌ Error en ${migration.name}:`, err.message)
        // Continue with next migration if table already exists
        if (err.message.includes('already exists')) {
          console.log('   (tabla ya existe, continuando...)')
        } else {
          throw err
        }
      }
    }

    console.log('\n🎉 Base de datos configurada exitosamente!')
    console.log('\nPróximos pasos:')
    console.log('  1. Ve a supabase.com/dashboard → Authentication → Users')
    console.log('  2. Invita usuarios con emails @quarta.co')
    console.log('  3. Inicia la app: npm run dev')
    console.log('  4. Login en http://localhost:3000/login')

  } catch (err) {
    console.error('\n❌ Error de conexión:', err.message)
    console.log('\nVerifica:')
    console.log('  - Password correcto (Dashboard → Settings → Database)')
    console.log('  - Proyecto no está pausado')
    console.log('  - No hay firewall bloqueando puerto 5432')
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()
