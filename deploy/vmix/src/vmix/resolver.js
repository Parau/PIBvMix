const norm = (v) => String(v ?? '').replace(/\r\n/g, '\n').trim()

export function titleFieldEntries(input) {
  return [
    ...(input?.text || []).map((field) => ({ ...field, kind: 'text' })),
    ...(input?.image || []).map((field) => ({ ...field, kind: 'image' })),
    ...(input?.color || []).map((field) => ({ ...field, kind: 'color' })),
  ].filter((field) => field.name)
}

export function titleFieldNames(input) {
  return titleFieldEntries(input).map((field) => field.name)
}

export function titlePresetIdentity(resource) {
  if (!resource || resource.type !== 'titlePreset' || !resource.inputKey || resource.presetIndex === undefined || resource.presetIndex === null) return null
  return `${resource.inputKey}::${Number(resource.presetIndex)}`
}

export function sameTitlePreset(a, b) {
  const left = titlePresetIdentity(a)
  return Boolean(left && left === titlePresetIdentity(b))
}

export function extendVerificationFieldNames(input, preferredNames = [], maxColumns = Infinity) {
  const detected = titleFieldNames(input)
  const detectedSet = new Set(detected)
  const result = []
  const add = (name) => {
    if (!name || !detectedSet.has(name) || result.includes(name) || result.length >= maxColumns) return
    result.push(name)
  }
  for (const name of preferredNames || []) add(name)
  for (const name of detected) add(name)
  return result.slice(0, maxColumns)
}

export function effectiveVerification(input, resource) {
  const rowLength = resource?.csvRow?.length || 0
  const preferredNames = resource?.verification?.fieldNames || []
  const fieldNames = extendVerificationFieldNames(input, preferredNames, rowLength || Infinity)
  return {
    mode: rowLength > 0 && fieldNames.length >= rowLength ? 'verifiedFields' : 'indexOnly',
    fieldNames,
  }
}

export function isResourceFullyVerifiable(input, resource) {
  return effectiveVerification(input, resource).mode === 'verifiedFields'
}

function currentFieldMap(input) {
  return new Map(titleFieldEntries(input).map((field) => [field.name, norm(field.value)]))
}

function logicalCandidates(input, resources) {
  const groups = new Map()
  for (const resource of resources) {
    if (resource.type !== 'titlePreset' || resource.inputKey !== input.key) continue
    const identity = titlePresetIdentity(resource)
    if (!identity) continue
    if (!groups.has(identity)) groups.set(identity, [])
    groups.get(identity).push(resource)
  }

  const candidates = []
  for (const group of groups.values()) {
    const signatures = new Set(group.map((resource) => JSON.stringify({
      csvRow: resource.csvRow || [],
      verification: effectiveVerification(input, resource),
    })))
    if (signatures.size > 1) return { conflict: true, candidates: [] }
    candidates.push(group[0])
  }
  return { conflict: false, candidates }
}

export function resolveTitleResource(input, resources) {
  if (!input) return { status: 'none', resource: null }
  const current = currentFieldMap(input)
  const logical = logicalCandidates(input, resources)
  if (logical.conflict) return { status: 'ambiguous', resource: null }
  const matches = logical.candidates.filter((resource) => {
    const verification = effectiveVerification(input, resource)
    if (verification.mode !== 'verifiedFields') return false
    return verification.fieldNames.every((name, i) => current.get(name) === norm(resource.csvRow?.[i]))
  })
  if (matches.length === 1) return { status: 'exact', resource: matches[0] }
  if (matches.length > 1) return { status: 'ambiguous', resource: null }
  return { status: 'unknown', resource: null }
}

export function verifyResourceFields(input, resource) {
  if (!input || !resource) return false
  const verification = effectiveVerification(input, resource)
  if (verification.mode !== 'verifiedFields') return false
  const current = currentFieldMap(input)
  return verification.fieldNames.every((name, i) => current.get(name) === norm(resource.csvRow?.[i]))
}
