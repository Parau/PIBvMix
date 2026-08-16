const norm = (v) => String(v ?? '').replace(/\r\n/g, '\n').trim()

export function resolveTitleResource(input, resources) {
  if (!input) return { status: 'none', resource: null }
  const candidates = resources.filter((r) => r.type === 'titlePreset' && r.inputKey === input.key && r.verification?.fieldNames?.length)
  const current = new Map((input.text || []).map((f) => [f.name, norm(f.value)]))
  const matches = candidates.filter((r) => r.verification.fieldNames.every((name, i) => current.get(name) === norm(r.csvRow?.[i])))
  if (matches.length === 1) return { status: 'exact', resource: matches[0] }
  if (matches.length > 1) return { status: 'ambiguous', resource: null }
  return { status: 'unknown', resource: null }
}

export function verifyResourceFields(input, resource) {
  const names = resource.verification?.fieldNames || []
  if (!names.length) return true
  const current = new Map((input?.text || []).map((f) => [f.name, norm(f.value)]))
  return names.every((name, i) => current.get(name) === norm(resource.csvRow?.[i]))
}
