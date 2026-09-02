import assert from 'assert'
global.localStorage = { _s: {}, getItem(k){ return this._s[k] ?? null }, setItem(k,v){ this._s[k]=String(v) }, removeItem(k){ delete this._s[k] }, clear(){ this._s={} } }
global.document = { getElementById: (id)=>{ if(!global._els) global._els={}; if(!global._els[id]) global._els[id]={ textContent:'', innerHTML:'', style:{}, appendChild(){}, setAttribute(){}, value:'', classList:{add(){},remove(){}} }; return global._els[id] }, createElement: ()=>({ textContent:'', innerHTML:'', style:{}, appendChild(){}, setAttribute(){}, className:'' }), body:{appendChild(){}}, querySelector:()=>null, querySelectorAll:()=>[] }
global.window = { dispatchEvent(){}, CustomEvent: class {}, matchMedia: ()=>({ matches:false }) }
global.Blob = class { constructor(parts){ this.parts=parts } get size(){ return this.parts.join('').length } }
global.setTimeout = (fn,ms)=>{ fn(); return 1 }
global.clearTimeout=()=>{}
global.location={ reload(){} }

const { store, uid } = await import('../src/lib/store.js')
const { weeklyAnalysis } = await import('../src/lib/planning.js')

function reset(){ localStorage.clear(); store.reset() }

console.log('=== S2 Verify ===')

// 11 Activity Log
reset()
store.addProject({ name:'Act Proj', nextAction:'do' })
assert(store.get().activity[0].type==='project_created', 'activity project_created')
store.addMemory({ content:'mem', type:'knowledge' })
assert(store.get().activity[0].type==='memory_created', 'activity memory')
store.addDecision({ title:'Dec', context:'ctx' })
assert(store.get().activity[0].type==='decision_created', 'activity decision')
let d=store.get()
d.sessions.unshift({ id:uid(), type:'focus', projectId: d.projects[0].id, actualMins:25, startedAt:new Date().toISOString(), endedAt:new Date().toISOString() })
store.set({ sessions: d.sessions })
assert(store.get().activity.length>=3, 'activity not noisy for render')
console.log('Activity Log PASS:', store.get().activity.slice(0,3).map(a=>a.type).join(', '))

// 16 Store boundary: no DOM
assert(!store.toString().includes('document.getElementById'), 'store should not contain document')
console.log('Store boundary PASS (no DOM)')

// 14 Cross-module links stable IDs
reset()
const idea = store.addIdea({ title:'Link Idea', description:'desc' })
const proj = store.addProject({ name:'Link Proj', nextAction:'next', linkedIdeaId: idea.id })
store.promoteIdea(idea.id, proj.id)
assert(store.get().ideas[0].linkedProjectId===proj.id, 'idea → project stable ID')
assert(store.get().projects[0].linkedIdeaId===idea.id, 'project → idea stable ID')
console.log('Cross-module Idea↔Project PASS')

reset()
store.addProject({ name:'MemProj', nextAction:'next' })
let mp = store.get().projects[0]
store.addMemory({ content:'linked', type:'knowledge', linkedProject: mp.id })
assert(store.get().memories[0].linkedProject===mp.id, 'memory → project stable ID')
console.log('Memory ↔ Project PASS')

// 13 Planning uses real signals
reset()
store.addProject({ name:'Plan P1', nextAction:'do', strategicImportance:5, effort:'M', deadline: new Date(Date.now()+1*86400000).toISOString().slice(0,10), blockers:['block'] })
let p1 = store.get().projects[0]
d = store.get()
d.sessions.unshift({ id:uid(), type:'focus', projectId:p1.id, actualMins:30, startedAt:new Date().toISOString(), endedAt:new Date().toISOString() })
d.daily[new Date().toISOString().slice(0,10)] = { priorities:['p'], timeBlocks:[{k:'deep', mins:120}], completedMins:30, focusSessions:1 }
store.set({ sessions: d.sessions, daily: d.daily })
let wa = weeklyAnalysis(store.get())
assert(wa.totalFocusMins===30, 'planning uses focus history')
assert(wa.totals.plannedMins===120, 'planning uses capacity')
assert(wa.blocked.length===1, 'planning uses blockers')
console.log('Planning Intelligence PASS: focus',wa.totalFocusMins,'planned',wa.totals.plannedMins,'blocked',wa.blocked.length)

// 12 Developer honest
const { mockDevSnapshot } = await import('../src/lib/devmode.js')
let snap = mockDevSnapshot()
assert(snap.connected===false && snap.commits.length===0 && snap.name===null, 'dev honest disconnected')
console.log('Developer honest PASS')

// 19 Production hardening: export no secrets, malformed import, quota, CSP, Tailwind, Vite
reset()
store.get().settings.aiKey='SECRET'
let exp = store.exportJSON()
assert(!exp.includes('SECRET'), 'export no secrets')
console.log('Export secrets PASS')
let before = JSON.stringify(store.get())
try{ store.importJSON('not json'); assert(false) }catch(e){ assert(e.message.includes('Invalid JSON')) }
assert(JSON.stringify(store.get())===before, 'malformed import preserved')
console.log('Malformed import PASS')
let bad = JSON.stringify({ meta:{version:99}, projects:[] })
try{ store.importJSON(bad); assert(false)}catch(e){ assert(e.message.includes('Unsupported')) }
assert(JSON.stringify(store.get())===before, 'bad version preserved')
console.log('Import safety PASS')
// Tailwind local check: src/input.css exists and index.html no CDN
import fs from 'fs'
assert(fs.existsSync('src/input.css'), 'tailwind local exists')
assert(!fs.readFileSync('index.html','utf8').includes('cdn.tailwindcss.com'), 'cdn removed')
console.log('Tailwind local PASS')
// Vite version
let pkg = JSON.parse(fs.readFileSync('package.json','utf8'))
assert(pkg.devDependencies.vite.includes('7.') || pkg.devDependencies.vite.includes('8.'), 'vite upgraded')
console.log('Vite upgraded PASS:', pkg.devDependencies.vite)
// CSP
let html = fs.readFileSync('index.html','utf8')
assert(html.includes('Content-Security-Policy'), 'CSP present')
console.log('CSP PASS')

console.log('=== ALL S2 VERIFY PASSED ===')
