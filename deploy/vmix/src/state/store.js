export function createStore(initialState) {
  let state = structuredClone(initialState)
  const listeners = new Set()
  return {
    getState: () => state,
    setState(update) {
      state = typeof update === 'function' ? update(state) : { ...state, ...update }
      listeners.forEach((fn) => fn(state))
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
  }
}

export const initialState = {
  mode: 'configure',
  connection: { status: 'idle', message: '', lastUpdated: null },
  vmixState: null,
  config: { schemaVersion: 2, vmix: { target: '' }, titleSources: [], resources: [] },
  ui: { query: '', filter: 'all', demo: false, busyInputKeys: [], toast: null },
}
