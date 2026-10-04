export const icon = (name) => ({
  camera:'◉', video:'▶', image:'◆', title:'T', mix:'▦', search:'⌕', settings:'⚙', grip:'⋮⋮', up:'↑', down:'↓', close:'×', upload:'⇧', download:'⇩'
}[name] || '•')
export function resourceIcon(type) {
  const v = String(type || '').toLowerCase()
  if (v.includes('video')) return icon('video')
  if (v.includes('image')) return icon('image')
  if (['gt','xaml','title'].includes(v) || v.includes('title')) return icon('title')
  if (v.includes('capture') || v.includes('camera')) return icon('camera')
  if (v.includes('mix')) return icon('mix')
  return '●'
}
