import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeTarget } from '../src/vmix/client.js'
import { buildOnAirSet, getTitleSwapContext } from '../src/vmix/safety.js'
import { parseCsv, labelForRow } from '../src/config/csv.js'
import { createMockModel, modelToXml, MockVmixClient } from '../src/vmix/mock.js'
import { effectiveVerification, isResourceFullyVerifiable, resolveTitleResource, verifyResourceFields } from '../src/vmix/resolver.js'

test('normalizes vMix addresses',()=>{
  assert.equal(normalizeTarget('192.168.1.50'),'http://192.168.1.50:8088')
  assert.equal(normalizeTarget('http://192.168.1.50:9000/api'),'http://192.168.1.50:9000')
})

test('CSV parser handles quotes, commas, BOM and multiline',()=>{
  const rows=parseCsv('\ufeff"Smith, John","Chief ""Executive"""\r\n"Line 1\nLine 2",Role\r\n')
  assert.deepEqual(rows,[['Smith, John','Chief "Executive"'],['Line 1\nLine 2','Role']])
  assert.equal(labelForRow(['John Smith','CEO'],0),'John Smith — CEO')
})

test('ON AIR graph includes program/active-overlay descendants, ignores preview-only overlays and handles cycles',()=>{
  const state={mainMix:{programKey:'a'},overlays:[{inputKey:'x',preview:false},{inputKey:'p',preview:true}],inputs:[
    {key:'a',layers:[{key:'b'}]},{key:'b',layers:[{key:'c'}]},{key:'c',layers:[{key:'a'}]},
    {key:'x',layers:[{key:'y'}]},{key:'y',layers:[]},{key:'p',layers:[{key:'q'}]},{key:'q',layers:[]},{key:'z',layers:[]}
  ]}
  assert.deepEqual([...buildOnAirSet(state)].sort(),['a','b','c','x','y'])
})

test('SWAP context allows only one direct active overlay path',()=>{
  const base={
    mainMix:{programKey:'cam'}, inputKeyByNumber:{1:'cam',2:'lower',3:'mix'}, additionalMixes:[],
    inputs:[{key:'cam',layers:[]},{key:'lower',layers:[]},{key:'mix',layers:[{key:'lower'}]}],
    overlays:[{number:2,inputKey:'lower',preview:false}],
  }
  assert.deepEqual(getTitleSwapContext(base,'lower'),{eligible:true,overlayNumber:2,reason:'direct-single-overlay'})
  const nested={...base,overlays:[{number:2,inputKey:'mix',preview:false}]}
  assert.equal(getTitleSwapContext(nested,'lower').eligible,false)
  const duplicate={...base,mainMix:{programKey:'lower'}}
  assert.equal(getTitleSwapContext(duplicate,'lower').reason,'multiple-on-air-paths')
  const extraMix={...base,additionalMixes:[{number:2,programNumber:2,previewNumber:1}]}
  assert.equal(getTitleSwapContext(extraMix,'lower').eligible,false)
})

test('mock XML represents two active overlays like vMix',()=>{
  const model=createMockModel()
  const xml=modelToXml(model)
  assert.match(xml,/<overlay number="1">7<\/overlay>/)
  assert.match(xml,/<overlay number="2">5<\/overlay>/)
  const numberToKey=Object.fromEntries(model.inputs.map((x)=>[x.number,x.key]))
  const state={
    mainMix:{programKey:numberToKey[model.active]}, inputKeyByNumber:numberToKey, additionalMixes:[], inputs:model.inputs,
    overlays:model.overlays.map((x)=>({number:x.number,inputKey:numberToKey[x.inputNumber]||null,preview:x.preview})),
  }
  const onAir=buildOnAirSet(state)
  assert.equal(onAir.has('lower-news'),true)
  assert.equal(onAir.has('lower-people'),true)
  assert.equal(getTitleSwapContext(state,'lower-people').eligible,true)
  assert.equal(getTitleSwapContext(state,'lower-news').eligible,false)
})

test('mock vMix commands update title, preview and overlay swap primitives',async()=>{
  const c=new MockVmixClient({latencyMs:0})
  await c.command('OverlayInput2Out')
  assert.equal(c.model.overlays.find((x)=>x.number===2).inputNumber,0)
  await c.command('SelectTitlePreset',{Input:'lower-people',Value:1})
  const input=c.model.inputs.find((x)=>x.key==='lower-people')
  assert.equal(input.text[0].value,'Maria Silva')
  await c.command('OverlayInput2In',{Input:'lower-people'})
  assert.equal(c.model.overlays.find((x)=>x.number===2).inputNumber,input.number)
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

test('title resolver reports ambiguity instead of guessing between identical presets',()=>{
  const input={key:'lower',text:[{name:'Name.Text',value:'Same Name'},{name:'Instagram.Text',value:'@same'}]}
  const resources=[
    {id:'a',type:'titlePreset',inputKey:'lower',csvRow:['Same Name','@same'],verification:{fieldNames:['Name.Text','Instagram.Text']}},
    {id:'b',type:'titlePreset',inputKey:'lower',csvRow:['Same Name','@same'],verification:{fieldNames:['Name.Text','Instagram.Text']}},
  ]
  assert.equal(resolveTitleResource(input,resources).status,'ambiguous')
})

test('indexOnly title becomes fully verifiable by appending exposed image field without changing text mapping order',()=>{
  const input={key:'lower',text:[{name:'TextBlock1.Text',value:'Cargo 01'},{name:'TextBlock2.Text',value:'Nome 01'}],image:[{name:'Image1.Source',value:'img.jpg'}],color:[]}
  const resource={id:'r',type:'titlePreset',inputKey:'lower',csvRow:['Nome 01','Cargo 01','img.jpg'],verification:{mode:'indexOnly',fieldNames:['TextBlock2.Text','TextBlock1.Text']}}
  assert.deepEqual(effectiveVerification(input,resource),{mode:'verifiedFields',fieldNames:['TextBlock2.Text','TextBlock1.Text','Image1.Source']})
  assert.equal(isResourceFullyVerifiable(input,resource),true)
  assert.equal(verifyResourceFields(input,resource),true)
  assert.equal(resolveTitleResource(input,[resource]).status,'exact')
})

test('effective verification can include color and refuses unresolved extra CSV columns',()=>{
  const input={key:'lower',text:[{name:'Name.Text',value:'Ana'}],image:[{name:'Photo.Source',value:'ana.jpg'}],color:[{name:'Accent.Color',value:'#fff'}]}
  const ok={id:'ok',type:'titlePreset',inputKey:'lower',csvRow:['Ana','ana.jpg','#fff'],verification:{mode:'indexOnly',fieldNames:['Name.Text']}}
  const incomplete={id:'bad',type:'titlePreset',inputKey:'lower',csvRow:['Ana','ana.jpg','#fff','extra'],verification:{mode:'indexOnly',fieldNames:['Name.Text']}}
  assert.deepEqual(effectiveVerification(input,ok).fieldNames,['Name.Text','Photo.Source','Accent.Color'])
  assert.equal(verifyResourceFields(input,ok),true)
  assert.equal(isResourceFullyVerifiable(input,incomplete),false)
  assert.equal(resolveTitleResource(input,[incomplete]).status,'unknown')
})

test('stale text remains unresolved even when image matches',()=>{
  const input={key:'lower',text:[{name:'Role.Text',value:'Cargo 01'},{name:'Name.Text',value:'Nome 01a'}],image:[{name:'Photo.Source',value:'same.jpg'}],color:[]}
  const resource={id:'r',type:'titlePreset',inputKey:'lower',csvRow:['Nome 01','Cargo 01','same.jpg'],verification:{mode:'indexOnly',fieldNames:['Name.Text','Role.Text']}}
  assert.equal(verifyResourceFields(input,resource),false)
  assert.equal(resolveTitleResource(input,[resource]).status,'unknown')
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
