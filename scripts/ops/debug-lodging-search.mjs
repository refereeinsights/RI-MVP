#!/usr/bin/env node
import fs from 'node:fs'

const DEFAULT_SLUG = 'rainier-challenge-boys-puyallup-wa'
const argv = process.argv.slice(2)

function getArg(name, fallback) {
  const idx = argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`))
  if (idx === -1) return fallback
  const raw = argv[idx]
  if (raw.includes('=')) return raw.split('=', 2)[1]
  const next = argv[idx + 1]
  if (!next || next.startsWith('--')) return fallback
  return next
}

function parseEnvFile(path) {
  if (!fs.existsSync(path)) return {}
  const text = fs.readFileSync(path, 'utf8')
  const out = {}
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const m = trimmed.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!m) continue
    out[m[1]] = m[2]
  }
  return out
}

const opts = {
  slug: getArg('slug', DEFAULT_SLUG),
  tournamentId: getArg('tournament-id'),
  venueId: getArg('venue-id'),
  forceNoDates: getArg('no-dates'),
  source: getArg('source', 'venue_map'),
  kw: getArg('kw', 'Tournament weekend stay'),
  sc: getArg('sc', 'tournamentinsights'),
  env: getArg('env', 'apps/ti-web/.env.local'),
}

const env = parseEnvFile(opts.env)

const baseUrl = env.TI_WEB_BASE_URL || 'http://localhost:3001'
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY

if (!baseUrl) {
  console.error('[error] TI_WEB_BASE_URL missing')
  process.exit(1)
}

async function fetchJson(url, headers = {}) {
  const res = await fetch(url, { headers })
  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    data = text
  }
  return { res, data }
}

async function fetchTournamentBySlug(slug) {
  if (!supabaseUrl || !serviceKey) {
    throw new Error('SUPABASE env missing (NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)')
  }
  const authHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    Accept: 'application/json',
  }
  const url = `${supabaseUrl}/rest/v1/tournaments_public?select=id,name,start_date,end_date&slug=eq.${encodeURIComponent(slug)}`
  const { res, data } = await fetchJson(url, authHeaders)
  if (!res.ok) throw new Error(`tournaments_public query failed (${res.status}): ${JSON.stringify(data)}`)
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`No tournaments found for slug: ${slug}`)
  }
  return data[0]
}

async function fetchVenueForTournament(tournamentId) {
  if (!supabaseUrl || !serviceKey) {
    throw new Error('SUPABASE env missing (NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)')
  }
  const authHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    Accept: 'application/json',
  }
  const url = `${supabaseUrl}/rest/v1/tournament_venues?select=venue_id,venues(id,name,city,state,latitude,longitude)&tournament_id=eq.${tournamentId}`
  const { res, data } = await fetchJson(url, authHeaders)
  if (!res.ok) throw new Error(`tournament_venues query failed (${res.status}): ${JSON.stringify(data)}`)
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`No venues found for tournamentId: ${tournamentId}`)
  }
  const row = data[0]
  const venue = Array.isArray(row.venues) ? row.venues[0] : row.venues
  return { venueId: row.venue_id, venue }
}

function isUUID(v) {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(String(v || '').trim())
}

function parseDateFromDb(value) {
  if (!value) return null
  const d = new Date(String(value))
  return Number.isNaN(d.getTime()) ? null : d
}

function isPastTournamentDateRange(startDate, endDate) {
  const end = parseDateFromDb(endDate)
  const start = parseDateFromDb(startDate)
  if (!end && !start) return false
  const now = Date.now()
  if (end && end.getTime() < now) return true
  if (!end && start && start.getTime() < now) return true
  return false
}

async function main() {
  let tournamentId = opts.tournamentId
  let venueId = opts.venueId
  let tournamentLookupId = opts.tournamentId
  let shouldSkipTournamentDates = false
  const forceNoDates = opts.forceNoDates === "1" || opts.forceNoDates === "true"

  if (!tournamentId || !venueId) {
    if (!tournamentId || !venueId) {
      try {
        if (!tournamentId) {
          console.log(`[step] resolving tournament by slug=${opts.slug}`)
          const tournament = await fetchTournamentBySlug(opts.slug)
          tournamentId = tournament.id
          tournamentLookupId = tournament.id
          console.log(`[ok] tournament`, tournament)
          if (!forceNoDates && isPastTournamentDateRange(tournament.start_date, tournament.end_date)) {
            shouldSkipTournamentDates = true
            console.log(`[info] tournament is in the past; using venue-only search (no dates)`)
            tournamentId = null
          }
        }

        if (!venueId) {
          console.log(`[step] resolving first venue for tournamentId=${tournamentLookupId}`)
          const venueRow = await fetchVenueForTournament(tournamentLookupId)
          venueId = venueRow.venueId
          console.log('[ok] venue', venueRow)
        }
      } catch (e) {
        console.error(`[error] ${e.message}`)
        console.log('[hint] If DNS/network is restricted in this environment, run this script from your local machine with internet access.')
        process.exit(1)
      }
    }
  }

  console.log('[step] inputs')
  console.log(`  slug=${opts.slug}`)
  console.log(`  tournamentId=${tournamentId || "<omitted>"}`)
  console.log(`  venueId=${venueId}`)
  console.log(`  source=${opts.source}`)
  console.log(`  kw=${opts.kw}`)
  console.log(`  sc=${opts.sc}`)
  console.log(`  forceNoDates=${forceNoDates}`)
  console.log(`  skipTournamentDates=${shouldSkipTournamentDates}`)

  if (!isUUID(venueId)) {
    console.error('[error] venueId is not a valid UUID')
    process.exit(1)
  }
  if (tournamentId && !isUUID(tournamentId)) {
    console.error('[error] tournamentId is not a valid UUID')
    process.exit(1)
  }

  const url = `${baseUrl.replace(/\/$/, '')}/api/lodging/search`
  const payload = {
    venueId,
    source: opts.source,
    kw: opts.kw,
    sc: opts.sc,
  }
  if (tournamentId) {
    payload.tournamentId = tournamentId
  }

  if (forceNoDates || shouldSkipTournamentDates) {
    console.log('[step] payload intentionally omits tournamentId for no-date fallback')
  }

  console.log('[step] POST', url)
  const start = Date.now()
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const text = await res.text()
  const ms = Date.now() - start
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = text
  }

  console.log(`[result] status=${res.status} duration=${ms}ms`)
  console.log(JSON.stringify(json, null, 2))

  if (!res.ok) {
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('[fatal]', err)
  process.exit(1)
})
