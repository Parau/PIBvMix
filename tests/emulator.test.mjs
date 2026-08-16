import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { VmixClient } from '../src/vmix/client.js'

let child
test.before(async()=>{ child=spawn(process.execPath,['emulator/server.mjs'],{cwd:new URL('..',import.meta.url).pathname,env:{...process.env,PORT:'18088'},stdio:'ignore'}); await sleep(160) })
test.after(()=>child?.kill())

test('production VmixClient works against HTTP emulator', async()=>{
  const client=new VmixClient('127.0.0.1:18088')
  let xml=await client.fetchState(); assert.match(xml,/<vmix>/)
  await client.command('PreviewInput',{Input:'video-1',Mix:0})
  xml=await client.fetchState(); assert.match(xml,/<preview>3<\/preview>/)
})

test('HTTP emulator exposes vMix-like state and commands',async()=>{
  let xml=await (await fetch('http://127.0.0.1:18088/api')).text(); assert.match(xml,/<vmix>/); assert.match(xml,/<preview>\d+<\/preview>/); assert.match(xml,/<overlay number="2" preview="True">5<\/overlay>/)
  let r=await fetch('http://127.0.0.1:18088/api/?Function=PreviewInput&Input=video-1&Mix=0'); assert.equal(r.status,200)
  xml=await (await fetch('http://127.0.0.1:18088/api')).text(); assert.match(xml,/<preview>3<\/preview>/)
  r=await fetch('http://127.0.0.1:18088/api/?Function=SelectTitlePreset&Input=lower-people&Value=2'); assert.equal(r.status,200)
  xml=await (await fetch('http://127.0.0.1:18088/api')).text(); assert.match(xml,/David Lee/); assert.match(xml,/@davidlee/)
  r=await fetch('http://127.0.0.1:18088/api/?Function=PreviewInput&Input=missing-guid'); assert.equal(r.status,500)
})
