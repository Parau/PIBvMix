import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeTarget } from '../src/vmix/client.js'
import { buildOnAirSet } from '../src/vmix/safety.js'
import { parseCsv, labelForRow } from '../src/config/csv.js'
import { createMockModel, MockVmixClient } from '../src/vmix/mock.js'
import { verifyResourceFields } from '../src/vmix/resolver.js'

test('normalizes vMix addresses',()=>{
  assert.equal(normalizeTarget('192.168.1.50'),'http://192.168.1.50:8088')
  assert.equal(normalizeTarget('http://192.168.1.50:9000/api'),'http://192.168.1.50:9000')
})

test('CSV parser handles quotes, commas, BOM and multiline',()=>{
  const rows=parseCsv('\ufeff"Smith, John","Chief ""Executive"""\r\n"Line 1\nLine 2",Role\r\n')
  assert.deepEqual(rows,[['Smith, John','Chief "Executive"'],['Line 1\nLine 2','Role']])
  assert.equal(labelForRow(['John Smith','CEO'],0),'John Smith — CEO')
})

test('ON AIR graph includes program/overlay descendants and handles cycles',()=>{
  const state={mainMix:{programKey:'a'},overlays:[{inputKey:'x'}],inputs:[
    {key:'a',layers:[{key:'b'}]},{key:'b',layers:[{key:'c'}]},{key:'c',layers:[{key:'a'}]},{key:'x',layers:[{key:'y'}]},{key:'z',layers:[]},{key:'y',layers:[]}
  ]}
  assert.deepEqual([...buildOnAirSet(state)].sort(),['a','b','c','x','y'])
})

test('mock vMix commands update title and preview',async()=>{
  const c=new MockVmixClient({latencyMs:0})
  await c.command('SelectTitlePreset',{Input:'lower-people',Value:1})
  const input=c.model.inputs.find((x)=>x.key==='lower-people')
  assert.equal(input.text[0].value,'Maria Silva')
  await c.command('PreviewInput',{Input:'lower-people',Mix:0})
  assert.equal(c.model.preview,input.number)
})

test('field verification detects a stale preset',()=>{
  const input={text:[{name:'Name.Text',value:'Maria Silva'},{name:'Role.Text',value:'CFO'}]}
  const ok={csvRow:['Maria Silva','CFO'],verification:{fieldNames:['Name.Text','Role.Text']}}
  const stale={csvRow:['John Smith','CEO'],verification:{fieldNames:['Name.Text','Role.Text']}}
  assert.equal(verifyResourceFields(input,ok),true)
  assert.equal(verifyResourceFields(input,stale),false)
})

test('mock fixture has representative inputs',()=>{ const m=createMockModel(); assert.ok(m.inputs.some((x)=>x.type==='GT')); assert.ok(m.inputs.some((x)=>x.layers.length)); assert.ok(m.overlays.length) })

test('storage helpers tolerate unreadable storage and surface write errors', async()=>{
  const { loadConfig, saveConfig } = await import('../src/config/storage.js')
  const bad={getItem(){throw new Error('blocked')},setItem(){throw new Error('quota')}}
  assert.equal(loadConfig(bad),null)
  assert.throws(()=>saveConfig({schemaVersion:2,resources:[]},bad),/quota/)
})

test('mock connection failure is explicit',async()=>{
  const c=new MockVmixClient({latencyMs:0}); c.failNext=true
  await assert.rejects(()=>c.fetchState(),/Simulated vMix network error/)
})
