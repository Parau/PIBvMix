import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'
import { VmixClient } from '../src/vmix/client.js'

let child
test.before(async()=>{ child=spawn(process.execPath,['emulator/server.mjs'],{cwd:fileURLToPath(new URL('..',import.meta.url)),env:{...process.env,PORT:'18088'},stdio:'ignore'}); await sleep(160) })
test.after(()=>child?.kill())

test('production VmixClient works against HTTP emulator', async()=>{
  const client=new VmixClient('127.0.0.1:18088')
  let xml=await client.fetchState(); assert.match(xml,/<vmix>/)
  await client.command('PreviewInput',{Input:'video-1',Mix:0})
  xml=await client.fetchState(); assert.match(xml,/<preview>3<\/preview>/)
})

test('HTTP emulator exposes safe Lower OUT -> preset -> IN swap sequence',async()=>{
  let xml=await (await fetch('http://127.0.0.1:18088/api')).text(); assert.match(xml,/<vmix>/); assert.match(xml,/<overlay number="2">5<\/overlay>/)
  let r=await fetch('http://127.0.0.1:18088/api/?Function=OverlayInput2Out'); assert.equal(r.status,200)
  xml=await (await fetch('http://127.0.0.1:18088/api')).text(); assert.match(xml,/<overlay number="2"><\/overlay>/)
  r=await fetch('http://127.0.0.1:18088/api/?Function=SelectTitlePreset&Input=lower-people&Value=2'); assert.equal(r.status,200)
  xml=await (await fetch('http://127.0.0.1:18088/api')).text(); assert.match(xml,/David Lee/); assert.match(xml,/@davidlee/)
  r=await fetch('http://127.0.0.1:18088/api/?Function=OverlayInput2In&Input=lower-people'); assert.equal(r.status,200)
  xml=await (await fetch('http://127.0.0.1:18088/api')).text(); assert.match(xml,/<overlay number="2">5<\/overlay>/)
  r=await fetch('http://127.0.0.1:18088/api/?Function=PreviewInput&Input=missing-guid'); assert.equal(r.status,500)
})

test('HTTP emulator accepts frozen-render Title preset replacement',async()=>{
  let r=await fetch('http://127.0.0.1:18088/api/?Function=PauseRender&Input=lower-people'); assert.equal(r.status,200)
  r=await fetch('http://127.0.0.1:18088/api/?Function=SelectTitlePreset&Input=lower-people&Value=1'); assert.equal(r.status,200)
  let xml=await (await fetch('http://127.0.0.1:18088/api')).text(); assert.match(xml,/Maria Silva/); assert.match(xml,/@mariasilva/)
  r=await fetch('http://127.0.0.1:18088/api/?Function=ResumeRender&Input=lower-people'); assert.equal(r.status,200)
})
