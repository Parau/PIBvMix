export function buildOnAirSet(vmixState) {
  const children = new Map(vmixState.inputs.map((input) => [input.key, (input.layers || []).map((x) => x.key).filter(Boolean)]))
  const roots = new Set()
  if (vmixState.mainMix?.programKey) roots.add(vmixState.mainMix.programKey)
  for (const overlay of vmixState.overlays || []) if (overlay.inputKey) roots.add(overlay.inputKey)
  const visited = new Set()
  const walk = (key) => {
    if (!key || visited.has(key)) return
    visited.add(key)
    for (const child of children.get(key) || []) walk(child)
  }
  roots.forEach(walk)
  return visited
}

export function isTitleCandidate(input) {
  return ['GT', 'Xaml', 'Title'].includes(input.type) || (input.text?.length || input.image?.length || input.color?.length)
}
