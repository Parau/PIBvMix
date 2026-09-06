function childMap(vmixState) {
  return new Map((vmixState.inputs || []).map((input) => [input.key, (input.layers || []).map((x) => x.key).filter(Boolean)]))
}

function reaches(children, rootKey, targetKey) {
  const visited = new Set()
  const walk = (key) => {
    if (!key || visited.has(key)) return false
    if (key === targetKey) return true
    visited.add(key)
    return (children.get(key) || []).some(walk)
  }
  return walk(rootKey)
}

export function buildOnAirSet(vmixState) {
  const children = childMap(vmixState)
  const roots = new Set()
  if (vmixState.mainMix?.programKey) roots.add(vmixState.mainMix.programKey)
  for (const overlay of vmixState.overlays || []) if (overlay.inputKey && !overlay.preview) roots.add(overlay.inputKey)
  const visited = new Set()
  const walk = (key) => {
    if (!key || visited.has(key)) return
    visited.add(key)
    for (const child of children.get(key) || []) walk(child)
  }
  roots.forEach(walk)
  return visited
}

export function getTitleSwapContext(vmixState, inputKey) {
  if (!vmixState || !inputKey) return { eligible: false, overlayNumber: null, reason: 'missing-state' }
  const children = childMap(vmixState)
  const sources = []
  const programKey = vmixState.mainMix?.programKey
  if (programKey && reaches(children, programKey, inputKey)) sources.push({ kind: 'program', rootKey: programKey })

  const activeOverlays = (vmixState.overlays || []).filter((overlay) => overlay.inputKey && !overlay.preview)
  for (const overlay of activeOverlays) {
    if (reaches(children, overlay.inputKey, inputKey)) sources.push({ kind: 'overlay', rootKey: overlay.inputKey, overlayNumber: overlay.number })
  }

  for (const mix of vmixState.additionalMixes || []) {
    const rootKey = vmixState.inputKeyByNumber?.[mix.programNumber] || null
    if (rootKey && reaches(children, rootKey, inputKey)) sources.push({ kind: 'mix', rootKey, mixNumber: mix.number })
  }

  const direct = activeOverlays.filter((overlay) => overlay.inputKey === inputKey)
  if (sources.length !== 1) return { eligible: false, overlayNumber: null, reason: sources.length ? 'multiple-on-air-paths' : 'not-on-air' }
  if (sources[0].kind === 'program' && sources[0].rootKey === inputKey && programKey === inputKey) {
    return { eligible: true, overlayNumber: null, reason: 'direct-program' }
  }
  if (direct.length !== 1 || sources[0].kind !== 'overlay' || sources[0].rootKey !== inputKey) {
    return { eligible: false, overlayNumber: null, reason: 'not-direct-single-overlay' }
  }
  return { eligible: true, overlayNumber: direct[0].number, reason: 'direct-single-overlay' }
}

export function isTitleCandidate(input) {
  return ['GT', 'Xaml', 'Title'].includes(input.type) || (input.text?.length || input.image?.length || input.color?.length)
}
