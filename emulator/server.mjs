import http from 'node:http'
import { URL } from 'node:url'
import { createMockModel, modelToXml } from '../src/vmix/mock.js'

const model = createMockModel()
const port = Number(process.env.PORT || 8088)
const cors = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Methods':'GET,OPTIONS', 'Access-Control-Allow-Headers':'Content-Type', 'Cache-Control':'no-store' }

const server = http.createServer((req,res)=>{
  if(req.method==='OPTIONS'){res.writeHead(204,cors);return res.end()}
  const url=new URL(req.url,`http://${req.headers.host || `127.0.0.1:${port}`}`)
  if(!url.pathname.startsWith('/api')){res.writeHead(404,{...cors,'Content-Type':'text/plain'});return res.end('Not Found')}
  try{
    const fn=url.searchParams.get('Function')
    if(fn){
      const ref=url.searchParams.get('Input'); const input=model.inputs.find((x)=>x.key===ref||x.number===Number(ref)||x.shortTitle===ref||x.title===ref)
      if(!input) throw new Error('Input not found')
      if(fn==='PreviewInput') model.preview=input.number
      else if(fn==='SelectTitlePreset'){
        const index=Number(url.searchParams.get('Value')); const row=input.presets?.[index]; if(!row) throw new Error('Preset not found')
        input.text.forEach((field,i)=>field.value=row[i]??'')
      } else throw new Error(`Unsupported Function ${fn}`)
      res.writeHead(200,{...cors,'Content-Type':'text/plain'});return res.end('OK')
    }
    res.writeHead(200,{...cors,'Content-Type':'text/xml; charset=utf-8'});res.end(modelToXml(model))
  }catch(err){res.writeHead(500,{...cors,'Content-Type':'text/plain'});res.end(err.message)}
})
server.listen(port,'0.0.0.0',()=>console.log(`PIBvMix vMix emulator listening on http://127.0.0.1:${port}/api`))
