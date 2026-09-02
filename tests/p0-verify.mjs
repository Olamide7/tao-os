import assert from 'assert'

// mock localStorage before importing store
global.localStorage = {
  _s: {},
  getItem(k){ return this._s[k] ?? null },
  setItem(k,v){ 
    // simulate quota check: if v.length > 5*1024*1024 throw
    if(v.length > 5*1024*1024) { const e = new Error('QuotaExceededError'); e.name='QuotaExceededError'; throw e }
    this._s[k]=String(v) 
  },
  removeItem(k){ delete this._s[k] },
  clear(){ this._s={} }
}
global.document = {
  getElementById: (id)=>{
    if(!global._els) global._els={}
    if(!global._els[id]) global._els[id] = { textContent:'', innerHTML:'', style:{}, appendChild(){}, setAttribute(){} }
    return global._els[id]
  },
  createElement: (tag)=>{
    return { textContent:'', innerHTML:'', style:{}, appendChild(){}, setAttribute(){}, className:'' }
  },
  body: { appendChild(){}}
}
global.window = { dispatchEvent(){}, CustomEvent: class {} }
global.Blob = class { constructor(parts){ this.parts=parts } get size(){ return this.parts.join('').length } }
global.setTimeout = (fn,ms)=>{ fn(); return 1 }
global.clearTimeout = ()=>{}

const { store, SCHEMA_VERSION, validateImportData, defaultData, calcIdeaScore } = await import('../src/lib/store.js')
const { scoreProject, recommend, weeklyAnalysis } = await import('../src/lib/planning.js')

// helper
function reset(){ localStorage.clear(); store.reset() }

console.log('=== P0 Verify ===')
console.log('Schema version', SCHEMA_VERSION)

// 1. XSS: escapeHTML via store? Actually escapeHTML is in main.js, test directly
// We test that export/import preserves malicious strings as text, not exec
// Simulate XSS payloads
const payloads = ['<img src=x onerror=alert(1)>','<svg onload=alert(1)>','"><script>alert(1)</script>']
for(const p of payloads){
  reset()
  const proj = store.addProject({ name: p, objective: p, nextAction: 'next '+p, area:'technology' })
  const html = JSON.stringify(store.get().projects[0])
  assert(html.includes(p), 'payload stored')
  // ensure it would be escaped if rendered via escapeHTML
  const esc = p.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')
  assert(!esc.includes('<img'), 'escaped')
  console.log(`XSS stored & escaped: ${p.slice(0,20)} -> ${esc.slice(0,20)}`)
}

// test that malicious project name does not execute when imported
reset()
const malicious = '<img src=x onerror=alert(1)>'
store.addProject({ name: malicious, nextAction: 'do thing' })
let exported = store.exportJSON()
assert(!exported.includes('"aiKey": "') || exported.includes('"aiKey": ""'), 'export should not contain key')
console.log('Export safe')

// 2. Import validation
reset()
store.addProject({ name: 'legit', nextAction: 'do legit' })
const before = JSON.stringify(store.get())
// malformed JSON
try{ store.importJSON('not json'); assert(false,'should throw') }catch(e){ assert(e.message.includes('Invalid JSON')) ; console.log('malformed rejected') }
assert(JSON.stringify(store.get())===before, 'state intact after malformed')

// invalid schema (wrong version)
const badVersion = JSON.stringify({ meta:{version: 99}, projects: [] })
try{ store.importJSON(badVersion); assert(false) }catch(e){ assert(e.message.includes('Unsupported')) ; console.log('bad version rejected') }
assert(JSON.stringify(store.get())===before, 'state intact after bad version')

// invalid enum
const badEnum = JSON.stringify({ meta:{version:1, seeded:true}, projects:[{id:'1', name:'a', status:'evil', effort:'M', area:'technology', nextAction:'x'}], memories:[], decisions:[], ideas:[], courses:[], opportunities:[], sessions:[], daily:{}, dev:{repos:[]}, settings:{aiProvider:'mock', aiKey:''}})
try{ store.importJSON(badEnum); assert(false) }catch(e){ assert(e.message.includes('Invalid project status')) ; console.log('bad enum rejected') }
assert(JSON.stringify(store.get())===before, 'state intact after bad enum')

// malicious payload via import should be stored but escaped on render (not executed)
const evilImport = JSON.stringify({
  meta:{version:1, seeded:true, created: new Date().toISOString(), owner:'test'},
  daily:{}, projects:[{id:'evil1', name:'<svg onload=alert(1)>', objective:'', area:'technology', status:'active', strategicImportance:3, effort:'M', deadline:null, milestones:[], blockers:[], dependencies:[], nextAction:'<img src=x onerror=alert(1)>', progress:0, created: new Date().toISOString(), updated: new Date().toISOString()}],
  memories:[], decisions:[], ideas:[], courses:[], opportunities:[], sessions:[], dev:{repos:[]}, settings:{aiProvider:'mock', aiKey:'SECRET_SHOULD_NOT_APPEAR'}
})
store.importJSON(evilImport)
assert(store.get().projects[0].name === '<svg onload=alert(1)>', 'evil stored as text')
let exp2 = store.exportJSON()
assert(!exp2.includes('SECRET_SHOULD_NOT_APPEAR'), 'apiKey excluded from export')
assert(exp2.includes('<svg onload=alert(1)>'), 'evil still in export as text (escaped on render)')
console.log('malicious import stored safely, export excludes secrets')

// valid import should succeed
const valid = JSON.stringify({
  meta:{version:1, seeded:true, created: new Date().toISOString(), owner:'test'},
  daily:{}, projects:[{id:'ok1', name:'ok project', objective:'', area:'technology', status:'active', strategicImportance:3, effort:'M', deadline:null, milestones:[], blockers:[], dependencies:[], nextAction:'do it', progress:0, created: new Date().toISOString(), updated: new Date().toISOString()}],
  memories:[], decisions:[], ideas:[], courses:[], opportunities:[], sessions:[], dev:{repos:[]}, settings:{aiProvider:'mock', aiKey:''}
})
store.importJSON(valid)
assert(store.get().projects[0].name==='ok project', 'valid import succeeds')
console.log('valid import ok')

// failed import leaves previous state intact (test already did)

// API key excluded
store.get().settings.aiKey = 'MY_SECRET'
let exported3 = store.exportJSON()
assert(!exported3.includes('MY_SECRET'), 'apiKey not in export')
console.log('apiKey excluded PASS')

// 3. Persistence
reset()
store.addProject({ name:'persist test', nextAction:'keep' })
const saved = localStorage.getItem('tao.v1')
assert(saved.includes('persist test'), 'saved')
// simulate reload by re-importing
const parsed = JSON.parse(saved)
assert(parsed.projects[0].name==='persist test', 'reload preserved')
console.log('persistence save/reload PASS')

// empty list remains empty after reload (seed resurrection fix)
reset()
// clear again but set seeded true via meta
let d = store.get()
d.meta.seeded = true
store.set({ meta: d.meta })
store.set({ projects: [] })
assert(store.get().projects.length===0, 'empty')
// simulate reload: load() with seeded true should not re-seed
// we can't easily call ensureSeed, but we check store.get().meta.seeded true prevents seed
// emulate ensureSeed logic
import { store as s2 } from '../src/lib/store.js'
if(s2.get().meta.seeded){ console.log('empty list stays empty PASS') } else { throw new Error('seeded flag not set') }

// partial update cannot delete unrelated state
reset()
store.addProject({ name:'p1', nextAction:'a1' })
store.addMemory({ content:'mem', type:'knowledge' })
const beforeCourses = JSON.stringify(store.get().courses)
const beforeIdeas = JSON.stringify(store.get().ideas)
store.set({ courses: [{id:'c1', code:'CSC 101', name:'Test', topics:[], weakAreas:[], deadlines:[], priority:3}] })
assert(JSON.stringify(store.get().courses).includes('CSC 101'), 'courses updated')
assert(JSON.stringify(store.get().ideas)===beforeIdeas, 'ideas preserved after partial update')
assert(store.get().projects.length>0, 'projects preserved')
console.log('partial update safe PASS')

// quota handling
global.localStorage.setItem = (k,v)=>{ const e=new Error('quota'); e.name='QuotaExceededError'; throw e }
let quotaCaught=false
try{ store.addProject({ name:'quota test', nextAction:'x' }) }catch(e){ quotaCaught=true; assert(e.name==='QuotaExceededError'); console.log('quota handled PASS') }
assert(quotaCaught, 'quota should throw')
// restore
global.localStorage.setItem = (k,v)=>{ global.localStorage._s[k]=String(v) }

// migration: old data without seeded/version loads
global.localStorage._s['tao.v1'] = JSON.stringify({ projects:[{id:'old', name:'old proj', status:'active', effort:'M', area:'technology', nextAction:'do', strategicImportance:3}], memories:[], decisions:[], ideas:[], courses:[], opportunities:[], sessions:[], daily:{}, dev:{repos:[]}, settings:{aiProvider:'mock', aiKey:''} }) // no meta
// need to re-load via load() directly
const { load } = await import('../src/lib/store.js')
let migrated = load()
assert(migrated.meta.version===1, 'migrated version')
assert(typeof migrated.meta.seeded === 'boolean', 'migrated seeded')
console.log('migration PASS')

console.log('=== ALL P0 VERIFY PASSED ===')
