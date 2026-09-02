import './input.css'
import { store, uid, todayISO, calcIdeaScore } from './lib/store.js'
import { recommend, weeklyAnalysis, scoreProject } from './lib/planning.js'
import { generateWithProvider } from './lib/ai.js'
import { mockDevSnapshot, pickRepoDirectory, scanDirectory } from './lib/devmode.js'
// router extracted to src/lib/router.js — see that file for navigation module (behavior preserved in main.js)

// --- Router & State ---
const routes = [
  { id:'command', label:'Today', icon:'◉', k:'T', group:'OPERATE' },
  { id:'focus', label:'Focus', icon:'⬢', k:'F', group:'OPERATE' },
  { id:'projects', label:'Projects', icon:'◆', k:'P', group:'OPERATE' },
  { id:'planning', label:'Planning', icon:'⚡', k:'E', group:'OPERATE' },
  { id:'memory', label:'Memory', icon:'◑', k:'M', group:'THINK' },
  { id:'decisions', label:'Decisions', icon:'✦', k:'D', group:'THINK' },
  { id:'ideas', label:'Ideas', icon:'💡', k:'I', group:'THINK' },
  { id:'study', label:'Study', icon:'🎓', k:'S', group:'DOMAINS' },
  { id:'business', label:'Business', icon:'₦', k:'B', group:'DOMAINS' },
  { id:'dev', label:'Developer', icon:'</>', k:'V', group:'DOMAINS' },
  { id:'weekly', label:'Weekly Review', icon:'▣', k:'W', group:'SYSTEM' },
  { id:'settings', label:'Settings', icon:'⚙', k:',', group:'SYSTEM' },
]

let current = localStorage.getItem('tao.route') || 'command'
let paletteIdx = 0
let devSnapshot = mockDevSnapshot()
let projectFilter = localStorage.getItem('tao.projectFilter') || 'all'
let projectSort = localStorage.getItem('tao.projectSort') || 'score'
let memoryFilter = localStorage.getItem('tao.memoryFilter') || 'all'
let activeProjectId = localStorage.getItem('tao.activeProject') || null
let focusState = (()=>{ try{ return JSON.parse(localStorage.getItem('tao.focus')||'null') }catch{return null} })() || { active:false, projectId:null, startedAt:null, elapsed:0, totalMins:25, paused:false }
let focusInterval = null
function persistFocus(){ localStorage.setItem('tao.focus', JSON.stringify(focusState)) }
function formatMins(sec){ const m=Math.floor(sec/60), s=sec%60; return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` }
function startFocus(projectId, mins=25){
  const proj = store.get().projects.find(p=>p.id===projectId)
  if(!proj) return
  if(focusState.active && focusState.projectId===projectId && focusState.paused){
    focusState.paused=false
    focusState.startedAt = Date.now() - focusState.elapsed*1000
  } else {
    focusState = { active:true, projectId, startedAt:Date.now(), elapsed:0, totalMins:mins, paused:false }
  }
  activeProjectId = projectId
  localStorage.setItem('tao.activeProject', projectId)
  persistFocus()
  if(focusInterval) clearInterval(focusInterval)
  focusInterval = setInterval(()=>{ focusState.elapsed = Math.floor((Date.now()-focusState.startedAt)/1000); persistFocus(); const el=document.getElementById('focusTimerDisplay'); if(el) el.textContent=formatMins(Math.max(0, focusState.totalMins*60 - focusState.elapsed)); const bar=document.getElementById('focusProgress'); if(bar) bar.style.width=`${Math.min(100, (focusState.elapsed/(focusState.totalMins*60))*100)}%`; if(focusState.elapsed>=focusState.totalMins*60){ finishFocus('completed') } }, 1000)
  go('focus')
}
function pauseFocus(){
  if(!focusState.active) return
  focusState.paused=true
  if(focusInterval) clearInterval(focusInterval)
  focusState.elapsed = Math.floor((Date.now()-focusState.startedAt)/1000)
  persistFocus()
  render()
}
function resumeFocus(){ if(focusState.paused) startFocus(focusState.projectId, focusState.totalMins) }
function finishFocus(outcome='completed'){
  if(focusInterval) clearInterval(focusInterval)
  const mins = Math.max(1, Math.round(focusState.elapsed/60))
  const proj = store.get().projects.find(p=>p.id===focusState.projectId)
  const now = new Date().toISOString()
  const d=store.get()
  d.sessions.unshift({ id:uid(), type:'focus', projectId:focusState.projectId, projectName:proj?.name||'', startedAt:new Date(focusState.startedAt).toISOString(), endedAt:now, actualMins:mins, outcome, nextAction:proj?.nextAction||'' })
  if(proj) store.updateProject(proj.id, { updated: now })
  else store.set({ sessions: d.sessions })
  const today = todayISO()
  const daily = d.daily[today] || { priorities:[], blockers:[], nextActions:[], timeBlocks:[], reflection:'' }
  daily.completedMins = (daily.completedMins||0)+mins
  daily.focusSessions = (daily.focusSessions||0)+1
  d.daily[today]=daily
  store.set({ daily: d.daily, sessions: d.sessions })
  focusState={ active:false, projectId:null, startedAt:null, elapsed:0, totalMins:25, paused:false }
  persistFocus()
  toast(outcome==='completed' ? `Focus session • ${mins}m recorded` : `Session stopped • ${mins}m`)
  go('command')
}
function cancelFocus(){
  if(focusInterval) clearInterval(focusInterval)
  focusState={ active:false, projectId:null, startedAt:null, elapsed:0, totalMins:25, paused:false }
  persistFocus()
  render()
}

function navHTML(){
  const groups = {}
  routes.forEach(r=>{ (groups[r.group] ||= []).push(r) })
  return Object.entries(groups).map(([g, items])=>`
    <div>
      <div class="text-[11px] tracking-[0.14em] text-tao-muted uppercase px-2 mb-2">${g}</div>
      <div class="space-y-1">
        ${items.map(r=>`
          <button data-route="${r.id}" class="w-full flex items-center gap-3 px-3 h-9 rounded-xl text-sm text-left border ${current===r.id? 'bg-white text-black border-white font-medium' : 'bg-tao-card border-tao-border text-zinc-300 hover:border-zinc-700'}">
            <span class="w-6 text-center text-xs">${r.icon}</span>
            <span class="flex-1">${r.label}</span>
            <span class="kbd ${current===r.id? '!text-zinc-600 !bg-zinc-100 !border-zinc-300' : ''}">${r.k}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `).join('')
}

function renderNav(){
  document.getElementById('nav').innerHTML = navHTML()
  document.querySelectorAll('[data-route]').forEach(b=>{
    b.addEventListener('click', ()=> go(b.dataset.route))
  })
}

function go(id){
  if(id.startsWith('project/')){
    activeProjectId=id.split('/')[1]
    localStorage.setItem('tao.activeProject', activeProjectId)
    current='project'
  } else {
    current=id
  }
  localStorage.setItem('tao.route', current)
  if(id.startsWith('project/')) localStorage.setItem('tao.route', id)
  renderNav()
  render()
  if(window.innerWidth<768){
    document.getElementById('sidebar').classList.add('hidden')
    const bd=document.getElementById('sidebarBackdrop')
    if(bd) bd.classList.add('hidden')
  }
}

function fmtDate(d){
  if(!d) return '—'
  try{ return new Date(d).toLocaleDateString('en-NG', { month:'short', day:'numeric', year:'numeric'}) }catch{ return d }
}
function daysLeft(d){
  if(!d) return null
  const diff = (new Date(d)-new Date())/86400000
  return Math.ceil(diff)
}
function effortBadge(e){
  const m={S:'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', M:'bg-amber-500/20 text-amber-300 border-amber-500/30', L:'bg-orange-500/20 text-orange-300 border-orange-500/40', XL:'bg-red-500/20 text-red-300 border-red-500/40'}
  return `<span class="text-[11px] px-2 py-1 rounded-full border ${m[e]||m.M}">${e}</span>`
}
function statusBadge(s){
  const m={active:'bg-white text-black', paused:'bg-zinc-800 text-zinc-300 border border-tao-border', done:'bg-emerald-500 text-black', archived:'bg-zinc-900 text-zinc-500'}
  return `<span class="text-[11px] px-2 py-1 rounded-full ${m[s]||m.active}">${s}</span>`
}

// --- Seed data for Nigerian student/dev/entrepreneur ---
function ensureSeed(){
  const d=store.get()
  if(d.projects.length>0) return
  // Seed projects
  try{
    store.addProject({ name:'Final Year Project — TAO OS', area:'technology', objective:'Ship local-first personal OS with 10 modules; demo to supervisor', strategicImportance:5, effort:'L', deadline: new Date(Date.now()+ 18*86400000).toISOString().slice(0,10), nextAction:'Implement Planning Engine scoring and wire to Command Center UI', milestones:['Spec done','Core modules','Supervisor demo','Deployment'], progress:42, blockers:[] })
    store.addProject({ name:'CSC 421 — Algorithms Revision', area:'academics', objective:'Ace exams: dynamic programming + graphs', strategicImportance:5, effort:'M', deadline: new Date(Date.now()+ 9*86400000).toISOString().slice(0,10), nextAction:'Solve 3 DP problems (knapsack, LCS, coin change) — 90 min deep work', milestones:['DP weak areas','Past questions 2019-2023'], progress:35, blockers:['NEPA — need power bank charged'] })
    store.addProject({ name:'Freelance — Paystack Landing Page Client', area:'business', objective:'Deliver and collect ₦250k balance', strategicImportance:4, effort:'S', deadline: new Date(Date.now()+ 4*86400000).toISOString().slice(0,10), nextAction:'Send client review link + Loom video and request feedback by EOD', milestones:['Design approved','Build','Review','Payment'], progress:78, dependencies:['Client provides testimonials'], blockers:[] })
    store.addProject({ name:'Campus Laundry Aggregator — Validation', area:'business', objective:'Validate demand in hostels with 30 interviews', strategicImportance:3, effort:'M', deadline: new Date(Date.now()+ 14*86400000).toISOString().slice(0,10), nextAction:'Interview 5 students in Hall B with 6-question script (record notes)', milestones:['Interview script','30 interviews','Pricing test'], progress:12, blockers:[] })
    store.addProject({ name:'Learn Rust — Systems Foundations', area:'technology', objective:'Complete Rustlings + build CLI tool', strategicImportance:3, effort:'M', deadline: null, nextAction:'Complete Rustlings ch 4 (ownership) — 45 min', paused:false, progress:20 })
  }catch(e){ console.warn(e) }
  store.addMemory({ type:'goal', title:'Graduate with First Class + profitable side business', content:'Primary goal: First Class. Secondary: ₦500k MRR from freelance + product. Constraint: power & data budgets.', tags:['graduation','revenue'] })
  store.addMemory({ type:'preference', title:'Work preferences', content:'Deep work 5-8am before classes. No meetings before 11am. Prefers keyboard + Vim. Limited data — prefer offline/local tools.', tags:['routine'] })
  store.addDecision({ title:'Build TAO as local-first, not cloud', context:'Unreliable internet, privacy, want ownership of memory', assumptions:['LocalStorage enough for MVP','Can later add SQLite/WASM','Users prefer offline'], evidence:['Tested Notion offline — poor','Interviewed 8 students: 6 want offline'], expectedOutcome:'Faster, private, resilient to network failure', confidence:72 })
  store.addDecision({ title:'Charge freelance client 50% upfront', context:'Previous client delayed payment 6 weeks', assumptions:['Client will pay upfront if value clear'], evidence:['Last project: chased payment'], expectedOutcome:'Cashflow stable', confidence:65, outcome:'', status:'pending' })
  store.addIdea({ title:'USSD fallback for laundry orders', description:'For students without data, allow USSD *384*... to place laundry pickup. Telco partnership?', scores:{ novelty:4, feasibility:2, impact:4, alignment:3 } })
  store.addIdea({ title:'Past Question AI — offline RAG', description:'Scan past questions, build local embeddings for CSC courses. No API cost.', scores:{ novelty:3, feasibility:4, impact:5, alignment:5 } })
  // courses
  const d2=store.get()
  if(d2.courses.length===0){
    d2.courses.push(
      { id:uid(), code:'CSC 421', name:'Algorithms', topics:['DP','Graphs','Greedy'], weakAreas:['DP','Amortized analysis'], sessions:[], deadlines:[{ title:'Test 1', date: new Date(Date.now()+7*86400000).toISOString().slice(0,10)}], priority:5 },
      { id:uid(), code:'CSC 405', name:'Operating Systems', topics:['Processes','Deadlocks','Paging'], weakAreas:['Deadlocks'], sessions:[], deadlines:[], priority:4 },
      { id:uid(), code:'ENT 301', name:'Entrepreneurship', topics:['Lean','Validation'], weakAreas:[], sessions:[], deadlines:[], priority:3 },
    )
    store.set({ courses: d2.courses })
  }
  // ops
  if(d2.opportunities.length===0){
    d2.opportunities.push(
      { id:uid(), title:'Laundry Aggregator — Hall B', stage:'validation', assumptions:['Students pay ₦800/basket','Riders available at ₦300/trip'], evidence:['5 interviews done — 4 said yes at ₦700'], revenue:0, prospects:[{name:'Hall B President', status:'contacted'}] },
      { id:uid(), title:'Freelance — Fintech Client', stage:'building', assumptions:['Client needs in 7 days'], evidence:['50% paid'], revenue:250000, prospects:[] },
    )
    store.set({ opportunities: d2.opportunities })
  }
}
ensureSeed()

// --- Views ---
function viewCommand(){
  const d=store.get()
  const today = todayISO()
  const daily = d.daily[today] || { priorities:[], blockers:[], nextActions:[], timeBlocks:[], reflection:'', completedMins:0, focusSessions:0 }
  const recs = recommend(d, 180).slice(0,3)
  const primary = recs[0]?.p
  const activeProjects = d.projects.filter(p=>p.status==='active')
  const active = activeProjects.length
  const totalPlanned = (daily.timeBlocks||[]).reduce((sum,tb)=> sum+(tb.mins||0),0) || 0
  const completed = daily.completedMins||0
  const capacity = totalPlanned>0 ? Math.max(0, totalPlanned - completed) : 180
  return `
  <div class="max-w-[960px] mx-auto px-4 md:px-6 py-8 md:py-12 space-y-10">
    <!-- Quiet header: date + capacity as subtle text -->
    <div class="space-y-6">
      <div class="text-sm text-tao-muted font-sans">${new Date().toLocaleDateString('en-NG',{weekday:'long', month:'long', day:'numeric'})} • ${completed}m done${totalPlanned? ` · ${capacity}m remaining`:''} • ${active} active</div>
      <div class="space-y-3">
        <h1 class="font-display text-[32px] md:text-[44px] font-semibold tracking-tight leading-[0.95] text-tao-text">What should you do <span class="text-tao-accent">now?</span></h1>
        ${primary ? `<div class="pt-2">
          <div class="text-sm text-tao-secondary">Next physical action</div>
          <div class="mt-2 text-xl md:text-2xl font-display font-medium leading-snug text-tao-text">${escapeHTML(primary.nextAction)}</div>
          <div class="mt-1 text-sm text-tao-muted">${escapeHTML(primary.name)} • ${primary.deadline? `due ${escapeHTML(fmtDate(primary.deadline))} • `:''}${escapeHTML(primary.area)}</div>
          <button data-start="${primary.id}" class="mt-4 h-10 px-6 rounded-ctrl bg-tao-accent text-black font-medium text-sm hover:brightness-105 transition">Start Focus — ${primary.effort==='S'?'15m':primary.effort==='M'?'25m':primary.effort==='L'?'50m':'25m'}</button>
        </div>` : `<div class="rounded-panel bg-tao-raised border border-tao-border p-6 text-center"><p class="text-tao-secondary">No active next action. Capture a project to begin.</p><button data-open-capture class="mt-3 h-9 px-4 rounded-ctrl bg-tao-accent text-black text-sm font-medium">+ Capture</button></div>`}
      </div>
    </div>
    <!-- Supporting: priorities as plain list, not cards -->
    <div class="space-y-3">
      <div class="flex items-baseline justify-between">
        <h2 class="font-display text-lg font-semibold">Today</h2>
        <button id="saveDaily" class="text-sm text-tao-accent hover:underline">Save</button>
      </div>
      <div class="rounded-panel bg-tao-surface border border-tao-border divide-y divide-tao-border">
        ${[0,1,2].map(i=>`
          <div class="flex items-center gap-3 px-4 py-3">
            <span class="w-6 h-6 grid place-items-center rounded-full bg-tao-raised border border-tao-border text-xs font-mono text-tao-muted">${i+1}</span>
            <input data-prio="${i}" value="${escapeHTML(daily.priorities[i]||'')}" placeholder="${i===0?'Primary focus':i===1?'Second priority':'Third priority'}" class="flex-1 bg-transparent outline-none text-sm placeholder:text-tao-muted" />
          </div>
        `).join('')}
        <div class="px-4 py-3 flex items-center gap-3 text-sm">
          <span class="text-tao-muted">Blockers</span>
          <input id="dailyBlockers" value="${escapeHTML((daily.blockers||[]).join(', '))}" placeholder="Nothing blocking, or add blocker" class="flex-1 bg-transparent outline-none placeholder:text-tao-muted" />
        </div>
      </div>
      <div class="text-xs text-tao-muted">Capacity: ${totalPlanned? `${completed}/${totalPlanned}m` : `${capacity}m default`} • <span class="text-tao-secondary">${activeProjects.filter(p=>p.blockers?.length).length} blocked</span></div>
    </div>
    <!-- Today's actions as plain list -->
    <div class="space-y-3">
      <h2 class="font-display text-lg font-semibold">Today's actions</h2>

      <div class="grid lg:grid-cols-3 gap-4 mt-6">
        <div class="lg:col-span-2 rounded-2xl bg-tao-bg border border-tao-border p-4">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-semibold">Today's Priorities (max 3)</h3>
            <button id="saveDaily" class="text-xs px-3 py-1.5 rounded-full bg-white text-black font-medium">Save day</button>
          </div>
          <div class="mt-3 space-y-2">
            ${[0,1,2].map(i=>`
              <div class="flex gap-2">
                <span class="w-7 h-9 grid place-items-center rounded-lg bg-tao-card border border-tao-border text-xs font-mono">${i+1}</span>
                <input data-prio="${i}" value="${escapeHTML(daily.priorities[i]||'')}" placeholder="${i===0?'e.g., Ship TAO Planning Engine scoring': i===1?'e.g., Solve 3 DP problems':'e.g., Send client Loom video'}" class="flex-1 h-9 rounded-xl bg-tao-card border border-tao-border px-3 text-sm outline-none" />
              </div>
            `).join('')}
          </div>
          <div class="grid sm:grid-cols-2 gap-3 mt-4">
            <div>
              <div class="text-xs text-tao-muted mb-1">Blockers today</div>
              <textarea id="dailyBlockers" rows="2" placeholder="NEPA, data, waiting on client…" class="w-full rounded-xl bg-tao-card border border-tao-border p-3 text-sm outline-none">${escapeHTML(daily.blockers?.join('\n')||'')}</textarea>
            </div>
            <div>
              <div class="text-xs text-tao-muted mb-1">Time allocation</div>
              <div class="space-y-1">
                ${[
                  {k:'deep', label:'Deep work (code/study)', val: daily.timeBlocks?.find(t=>t.k==='deep')?.mins || 120},
                  {k:'admin', label:'Admin / comms', val: daily.timeBlocks?.find(t=>t.k==='admin')?.mins || 45},
                  {k:'classes', label:'Classes / transit', val: daily.timeBlocks?.find(t=>t.k==='classes')?.mins || 180},
                ].map(t=>`
                  <div class="flex items-center gap-2 text-xs"><span class="flex-1">${t.label}</span><input data-time="${t.k}" type="number" value="${t.val}" class="w-20 h-8 rounded-lg bg-tao-card border border-tao-border px-2 text-sm" /> <span class="text-tao-muted">min</span></div>
                `).join('')}
              </div>
    </div>
    <!-- Supporting intelligence: plain, not cards -->
    <div class="space-y-2">
      <h2 class="font-display text-base font-medium text-tao-text">Up next</h2>
      <div class="divide-y divide-tao-border border-y border-tao-border">
        ${recs.slice(0,3).map(({p,score},i)=>`
          <div class="flex items-center gap-4 py-3">
            <span class="text-xs font-mono text-tao-muted w-6">${i+1}</span>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium truncate">${escapeHTML(p.name)}</div>
              <div class="text-xs text-tao-muted truncate">${escapeHTML(p.nextAction)}</div>
            </div>
            <span class="text-xs font-mono text-tao-muted">${score}</span>
            <button data-start="${p.id}" class="h-7 px-3 rounded-ctrl bg-tao-raised border border-tao-border text-xs">Focus</button>
          </div>
        `).join('') || '<div class="py-6 text-sm text-tao-muted text-center">No recommendations — capture a project.</div>'}
      </div>
      <button onclick="go('planning')" class="text-sm text-tao-accent hover:underline">Planning →</button>
    </div>
    <div class="space-y-3">
      <h2 class="font-display text-base font-medium">All next actions</h2>
      <div class="rounded-panel border border-tao-border divide-y divide-tao-border">
        ${d.projects.filter(p=>p.status==='active').sort((a,b)=> scoreProject(b,180)-scoreProject(a,180)).map(p=>`
          <div class="flex items-center gap-3 px-4 py-3 hover:bg-tao-raised/50 transition">
            <input type="checkbox" data-done="${p.id}" class="w-4 h-4 rounded accent-tao-accent" aria-label="Mark done" />
            <div class="flex-1 min-w-0 cursor-pointer" data-open-project="${p.id}">
              <div class="text-sm truncate">${escapeHTML(p.nextAction)}</div>
              <div class="text-xs text-tao-muted truncate">${escapeHTML(p.name)} • ${p.deadline? escapeHTML(fmtDate(p.deadline)): 'no deadline'}</div>
            </div>
            <button data-focus="${p.id}" class="hidden sm:inline h-7 px-3 rounded-ctrl border border-tao-border text-xs">Focus</button>
          </div>
        `).join('') || '<div class="p-8 text-center text-sm text-tao-muted">Clear — <button data-open-capture class="text-tao-accent underline">capture</button> or promote idea.</div>'}
      </div>
    </div>
  </div>
  `
}

function viewFocus(){
  const d=store.get()
  const proj = d.projects.find(p=>p.id===focusState.projectId) || recommend(d, 25)[0]?.p
  if(!proj){
    return `<div class="p-8 max-w-[700px] mx-auto text-center space-y-4"><h1 class="text-2xl font-semibold">Focus Mode</h1><p class="text-tao-muted">No active project with next action. Create one or pick from Today.</p><button onclick="document.querySelector('[data-route=command]').click()" class="h-10 px-4 rounded-ctrl bg-tao-accent text-black font-medium">Go to Today</button></div>`
  }
  const elapsed = focusState.active ? focusState.elapsed : 0
  const remaining = Math.max(0, focusState.totalMins*60 - elapsed)
  const pct = focusState.active ? Math.min(100, (elapsed/(focusState.totalMins*60))*100) : 0
  return `
  <div class="min-h-[calc(100vh-64px)] flex flex-col items-center justify-center px-4 py-12 bg-tao-bg">
    <div class="w-full max-w-[520px] text-center space-y-8">
      <div class="space-y-3">
        <div class="text-sm text-tao-muted">${escapeHTML(proj.name)} • ${escapeHTML(proj.area)}${proj.deadline? ` • due ${escapeHTML(fmtDate(proj.deadline))}`:''}</div>
        <h1 class="font-display text-2xl md:text-3xl font-medium leading-tight text-tao-text">${escapeHTML(proj.nextAction)}</h1>
        ${proj.blockers?.length? `<div class="text-sm text-tao-danger">${escapeHTML(proj.blockers.join(', '))}</div>`:''}
      </div>
      <div class="space-y-4">
        <div id="focusTimerDisplay" class="font-mono text-[72px] md:text-[84px] font-light tracking-tight leading-none text-tao-text">${formatMins(remaining)}</div>
        <div class="text-sm text-tao-muted">${focusState.paused? 'Paused': focusState.active ? 'Focusing' : 'Ready to focus'}</div>
        <div class="mx-auto max-w-[320px] h-1 rounded-full bg-tao-border overflow-hidden"><div id="focusProgress" class="h-full bg-tao-accent transition-all duration-300" style="width:${pct}%"></div></div>
        <div class="text-xs text-tao-muted">${focusState.totalMins}m • ${Math.round(pct)}% • ${escapeHTML(proj.effort)}</div>
      </div>
      <div class="flex gap-3 justify-center">
        ${!focusState.active ? `<button id="focusStart" class="h-11 px-8 rounded-ctrl bg-tao-accent text-black font-medium hover:brightness-105 transition">Start</button>` : focusState.paused ? `<button id="focusResume" class="h-11 px-8 rounded-ctrl bg-tao-accent text-black font-medium">Resume</button><button id="focusCancel" class="h-11 px-8 rounded-ctrl bg-tao-raised border border-tao-border">Cancel</button>` : `<button id="focusPause" class="h-11 px-8 rounded-ctrl bg-tao-raised border border-tao-border">Pause</button><button id="focusFinish" class="h-11 px-8 rounded-ctrl bg-tao-success text-black font-medium">Done</button>`}
      </div>
      <div class="flex gap-2 justify-center">
        <button data-focus-mins="15" class="h-7 px-3 rounded-full text-xs border ${focusState.totalMins===15?'bg-tao-text text-black border-tao-text':'border-tao-border text-tao-muted'}">15</button>
        <button data-focus-mins="25" class="h-7 px-3 rounded-full text-xs border ${focusState.totalMins===25?'bg-tao-text text-black border-tao-text':'border-tao-border text-tao-muted'}">25</button>
        <button data-focus-mins="50" class="h-7 px-3 rounded-full text-xs border ${focusState.totalMins===50?'bg-tao-text text-black border-tao-text':'border-tao-border text-tao-muted'}">50</button>
        <button id="focusSwitch" class="h-7 px-3 rounded-full border border-tao-border text-xs text-tao-muted">Change</button>
      </div>
    </div>
  </div>
  `
}
function viewProjects(){
  const d=store.get()
  const q = (document.getElementById('globalSearch')?.value || '').toLowerCase()
  let list = [...d.projects]
  // global search across all project fields including milestones/dependencies/blockers
  if(q) list = list.filter(p=> (p.name+' '+(p.objective||'')+' '+(p.nextAction||'')+' '+(p.blockers||[]).join(' ')+' '+(p.milestones||[]).join(' ')+' '+(p.dependencies||[]).join(' ')+' '+p.area).toLowerCase().includes(q))
  // filter by status
  if(projectFilter !== 'all') list = list.filter(p=> p.status===projectFilter)
  // sort
  if(projectSort==='deadline'){
    list.sort((a,b)=>{
      if(!a.deadline && !b.deadline) return 0
      if(!a.deadline) return 1
      if(!b.deadline) return -1
      return new Date(a.deadline) - new Date(b.deadline)
    })
  } else if(projectSort==='importance'){
    list.sort((a,b)=> (b.strategicImportance||3)-(a.strategicImportance||3))
  } else { // score
    list.sort((a,b)=> scoreProject(b,120)-scoreProject(a,120))
  }
  return `
  <div class="max-w-[960px] mx-auto px-4 md:px-6 py-8 space-y-6">
    <div class="flex items-baseline justify-between">
      <h1 class="font-display text-2xl font-semibold">Projects</h1>
      <button id="newProjectBtn" class="h-8 px-3 rounded-ctrl bg-tao-accent text-black text-sm font-medium">+ New</button>
    </div>
    <div class="flex items-center gap-2 text-sm border-b border-tao-border pb-3">
      <div class="flex gap-1">
        ${['all','active','paused','done'].map(s=>`<button data-filter="${s}" class="px-3 py-1 rounded-full text-xs ${projectFilter===s?'bg-tao-text text-black':'text-tao-muted hover:text-tao-text'}">${escapeHTML(s)}</button>`).join('')}
      </div>
      <span class="text-xs text-tao-muted ml-2">${list.length} total</span>
      <select id="sortProjects" class="ml-auto h-7 rounded-full bg-transparent border border-tao-border px-2 text-xs">
        <option value="score" ${projectSort==='score'?'selected':''}>Score</option>
        <option value="deadline" ${projectSort==='deadline'?'selected':''}>Deadline</option>
        <option value="importance" ${projectSort==='importance'?'selected':''}>Importance</option>
      </select>
    </div>

    <div id="projectGrid" class="divide-y divide-tao-border border-y border-tao-border">
      ${list.map(p=>{
        const score = scoreProject(p, 120)
        const dl = daysLeft(p.deadline)
        return `
        <div data-proj="${p.id}" class="flex items-center gap-4 py-4 hover:bg-tao-raised/50 transition">
          <div class="flex-1 min-w-0 cursor-pointer" data-open-project="${p.id}">
            <div class="flex items-center gap-2 text-xs text-tao-muted"><span class="${p.status==='active'?'text-tao-success':p.status==='done'?'text-tao-muted':'text-tao-warning'}">●</span> ${escapeHTML(p.area)} • ${p.deadline? `${escapeHTML(fmtDate(p.deadline))} • `:''}${score}/100</div>
            <h3 class="font-medium leading-tight truncate">${escapeHTML(p.name)}</h3>
            <div class="text-sm text-tao-secondary truncate">${escapeHTML(p.nextAction || '—')}</div>
            ${p.milestones?.length? `<div class="text-xs text-tao-muted truncate">${escapeHTML(p.milestones.join(' • '))}</div>`:''}
          </div>
          <div class="hidden sm:flex flex-col items-end gap-1 min-w-[80px]">
            <span class="text-xs font-mono text-tao-muted">${dl!==null ? (dl<0? `${Math.abs(dl)}d overdue` : dl===0? 'today': `${dl}d`) : ''}</span>
            <div class="w-16 h-1 rounded-full bg-tao-border overflow-hidden"><div class="h-full bg-tao-accent" style="width:${p.progress||0}%"></div></div>
          </div>
          <button data-edit="${p.id}" class="hidden md:inline h-7 px-3 rounded-ctrl border border-tao-border text-xs">Edit</button>
          <button data-advance="${p.id}" class="h-7 w-7 grid place-items-center rounded-ctrl bg-tao-raised border border-tao-border text-xs">→</button>
        </div>
        `
      }).join('')}
    </div>

    ${list.length===0? '<div class="text-center py-16 text-tao-muted">No projects match. Press N to create your first — with a next action.</div>':''}
  </div>

  <dialog id="projDialog" class="rounded-dialog p-0 border border-tao-border bg-tao-surface text-white w-[min(640px,92vw)] md:w-[min(640px,95vw)] backdrop:bg-black/60">
    <form method="dialog" id="projForm" class="p-6 space-y-4">
      <h3 class="font-display text-lg font-semibold">New / Edit Project</h3>
      <input type="hidden" id="projId" />
      <label class="block text-xs">Name<input id="projName" required placeholder="e.g., Final Year Project — TAO OS" class="mt-1 w-full h-10 rounded-ctrl bg-tao-card border border-tao-border px-3 text-sm outline-none" /></label>
      <label class="block text-xs">Objective<textarea id="projObj" rows="2" placeholder="One clear outcome…" class="mt-1 w-full rounded-ctrl bg-tao-card border border-tao-border p-3 text-sm"></textarea></label>
      <div class="grid grid-cols-2 gap-3">
        <label class="text-xs">Area<select id="projArea" class="mt-1 w-full h-10 rounded-ctrl bg-tao-card border border-tao-border px-3 text-sm"><option>technology</option><option>academics</option><option>business</option><option>personal</option></select></label>
        <label class="text-xs">Effort<select id="projEffort" class="mt-1 w-full h-10 rounded-ctrl bg-tao-card border border-tao-border px-3 text-sm"><option>S</option><option selected>M</option><option>L</option><option>XL</option></select></label>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <label class="text-xs">Importance (1-5)<input id="projImp" type="number" min="1" max="5" value="3" class="mt-1 w-full h-10 rounded-ctrl bg-tao-card border border-tao-border px-3 text-sm" /></label>
        <label class="text-xs">Deadline<input id="projDeadline" type="date" class="mt-1 w-full h-10 rounded-ctrl bg-tao-card border border-tao-border px-3 text-sm" /></label>
      </div>
      <label class="block text-xs">Status<select id="projStatus" class="mt-1 w-full h-10 rounded-ctrl bg-tao-card border border-tao-border px-3 text-sm"><option value="active">active</option><option value="paused">paused</option><option value="done">done</option></select></label>
      <label class="block text-xs">Next physical action — <span class="text-tao-accent">required if active</span><input id="projNext" placeholder="e.g., Open VS Code and write test for planning.js" class="mt-1 w-full h-10 rounded-ctrl bg-tao-card border border-tao-border px-3 text-sm outline-none" /></label>
      <label class="block text-xs">Blockers (comma separated)<input id="projBlockers" placeholder="NEPA, waiting on… " class="mt-1 w-full h-10 rounded-ctrl bg-tao-card border border-tao-border px-3 text-sm" /></label>
      <label class="block text-xs">Milestones (comma separated)<input id="projMilestones" placeholder="e.g., Spec done, Prototype, Demo" class="mt-1 w-full h-10 rounded-ctrl bg-tao-card border border-tao-border px-3 text-sm" /></label>
      <label class="block text-xs">Dependencies (comma separated — other project names)<input id="projDeps" placeholder="e.g., Client feedback, Auth module" class="mt-1 w-full h-10 rounded-ctrl bg-tao-card border border-tao-border px-3 text-sm" /></label>
      <div class="flex gap-2 justify-between pt-2">
        <button type="button" id="deleteProj" class="h-10 px-4 rounded-ctrl border border-red-500/30 text-red-300 text-sm hidden">Delete</button>
        <div class="ml-auto flex gap-2">
          <button value="cancel" class="h-10 px-4 rounded-ctrl bg-tao-card border border-tao-border text-sm">Cancel</button>
          <button id="saveProj" value="default" class="h-10 px-5 rounded-ctrl bg-tao-accent text-black text-sm font-semibold">Save</button>
        </div>
      </div>
      <p class="text-[11px] text-tao-muted">TAO enforces: active projects without a next action will be rejected.</p>
    </form>
  </dialog>
  `
}

function viewProject(){
  const d=store.get()
  const proj = d.projects.find(p=>p.id===activeProjectId)
  if(!proj) return `<div class="p-8 text-center text-tao-muted">No project selected. <button onclick="go('projects')" class="text-tao-accent underline">Open Projects</button></div>`
  const relatedMems = d.memories.filter(m=>m.linkedProject===proj.id)
  const relatedDecs = d.decisions.filter(dec=> dec.linkedProject===proj.id)
  const sessions = d.sessions.filter(s=> s.projectId===proj.id)
  const totalMins = sessions.reduce((sum,s)=> sum+(s.actualMins||s.mins||0),0)
  const score = scoreProject(proj, 120)
  return `
  <div class="p-4 md:p-6 max-w-[900px] mx-auto space-y-6">
    <button onclick="go('projects')" class="text-xs text-tao-muted hover:text-white">← Back to Projects</button>
    <div class="rounded-[24px] bg-tao-surface border border-tao-border p-6">
      <div class="flex items-start justify-between gap-4">
        <div>
          <div class="flex items-center gap-2">${statusBadge(proj.status)} ${effortBadge(proj.effort)} <span class="text-xs text-tao-muted">${escapeHTML(proj.area)} • ${proj.deadline? `Due ${escapeHTML(fmtDate(proj.deadline))}`:'No deadline'}</span></div>
          <h1 class="text-2xl font-semibold mt-2">${escapeHTML(proj.name)}</h1>
          <p class="text-sm text-tao-muted mt-1">${escapeHTML(proj.objective||'')}</p>
        </div>
        <div class="text-center min-w-[80px]"><div class="text-3xl font-mono font-bold">${score}</div><div class="text-xs text-tao-muted">/100</div><div class="w-full h-1 bg-tao-card rounded-full mt-1"><div class="h-full bg-tao-accent" style="width:${proj.progress||0}%"></div></div><div class="text-xs text-tao-muted">${proj.progress||0}%</div></div>
      </div>
      <div class="mt-6 rounded-xl bg-tao-accent text-black p-4">
        <div class="text-xs font-mono uppercase tracking-widest">Next physical action</div>
        <div class="text-lg font-medium mt-1">${escapeHTML(proj.nextAction)}</div>
        <div class="flex gap-2 mt-3">
          <button data-start="${proj.id}" class="h-10 px-4 rounded-ctrl bg-black text-white text-sm font-medium">▶ Focus</button>
          <button data-advance="${proj.id}" class="h-10 px-4 rounded-ctrl bg-white text-black text-sm font-medium">Update</button>
          <button onclick="openProjDialog('${proj.id}')" class="h-10 px-4 rounded-ctrl bg-tao-card border border-tao-border text-sm">Edit</button>
        </div>
      </div>
      <div class="grid md:grid-cols-3 gap-4 mt-6 text-sm">
        <div class="rounded-xl bg-tao-card border border-tao-border p-4"><div class="font-semibold">Milestones</div><div class="mt-2 space-y-1">${proj.milestones?.length? proj.milestones.map(m=>`<div class="flex gap-2"><span class="text-tao-accent">•</span><span>${escapeHTML(m)}</span></div>`).join(''):'<span class=text-tao-muted>No milestones</span>'}<div class="text-xs text-tao-muted mt-2">${proj.milestones?.length||0} milestones</div></div></div>
        <div class="rounded-xl bg-tao-card border border-tao-border p-4"><div class="font-semibold">Dependencies</div><div class="mt-2">${proj.dependencies?.length? proj.dependencies.map(d=>`<div>• ${escapeHTML(d)}</div>`).join(''):'<span class=text-tao-muted>None</span>'}</div><div class="rounded-lg bg-red-500/10 border border-red-500/20 p-2 mt-2 text-xs text-red-300 ${proj.blockers?.length?'':'hidden'}">Blockers: ${escapeHTML((proj.blockers||[]).join(', '))}</div></div>
        <div class="rounded-xl bg-tao-card border border-tao-border p-4"><div class="font-semibold">Activity</div><div class="text-xs text-tao-muted">${sessions.length} focus sessions • ${totalMins}m total</div><div class="mt-2 space-y-1 text-xs">${sessions.slice(0,5).map(s=>`<div>${escapeHTML(s.actualMins||s.mins)}m • ${escapeHTML(s.outcome||'focus')} • ${new Date(s.endedAt||s.date).toLocaleDateString()}</div>`).join('')||'<span class=text-tao-muted>No sessions yet</span>'}</div></div>
      </div>
      <div class="grid md:grid-cols-2 gap-4 mt-4">
        <div class="rounded-xl bg-tao-card border border-tao-border p-4"><div class="font-semibold text-sm">Linked Decisions</div><div class="mt-2 space-y-2 text-xs">${relatedDecs.length? relatedDecs.map(d=>`<div class="p-2 rounded-lg bg-tao-surface border border-tao-border"><div class="font-medium">${escapeHTML(d.title)}</div><div class="text-tao-muted">${escapeHTML(d.status)} • ${d.confidence}%</div></div>`).join(''):'<span class=text-tao-muted>No decisions linked</span>'}<button data-add-decision="${proj.id}" class="mt-2 text-xs text-tao-accent">+ Log decision</button></div></div>
        <div class="rounded-xl bg-tao-card border border-tao-border p-4"><div class="font-semibold text-sm">Linked Memory</div><div class="mt-2 space-y-2 text-xs">${relatedMems.length? relatedMems.map(m=>`<div class="p-2 rounded-lg bg-tao-surface border border-tao-border">${escapeHTML(m.title||m.content.slice(0,40))}</div>`).join(''):'<span class=text-tao-muted>No memory linked</span>'}<button data-add-memory="${proj.id}" class="mt-2 text-xs text-tao-accent">+ Remember</button></div></div>
      </div>
    </div>
  </div>
  `
}
function viewMemory(){
  const d=store.get()
  const q=(document.getElementById('globalSearch')?.value||'').toLowerCase()
  let memories=d.memories
  if(q) memories=memories.filter(m=> (m.title+' '+m.content+' '+m.type+' '+(m.tags||[]).join(' ')).toLowerCase().includes(q))
  if(memoryFilter!=='all') memories=memories.filter(m=> m.type===memoryFilter)
  const types=['all','project','decision','goal','preference','knowledge','person','business','academic','technology','idea']
  return `
  <div class="max-w-[960px] mx-auto px-4 md:px-6 py-8 space-y-6">
    <div class="flex items-baseline justify-between">
      <h1 class="font-display text-2xl font-semibold">Memory</h1>
      <button id="addMemBtn" class="h-8 px-3 rounded-ctrl bg-tao-accent text-black text-sm font-medium">+ Remember</button>
    </div>
    <p class="text-sm text-tao-muted">Retrieval-first — searchable, linked to projects, by type.</p>
    <div class="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0">
      ${types.map(t=>`<button data-memfilter="${t}" class="shrink-0 h-7 px-3 rounded-full text-xs border ${memoryFilter===t?'bg-tao-text text-black border-tao-text':'border-tao-border text-tao-muted hover:text-tao-text'}">${escapeHTML(t)}</button>`).join('')}
    </div>
    <div class="border-y border-tao-border divide-y divide-tao-border" id="memGrid">
      ${memories.map(m=>{
        const linked = m.linkedProject ? store.get().projects.find(p=>p.id===m.linkedProject) : null
        return `<div class="flex gap-4 py-4">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 text-xs text-tao-muted"><span>${escapeHTML(m.type)}</span><span>•</span><span>${new Date(m.created).toLocaleDateString()}</span>${linked? `<span>•</span><button data-open-project="${linked.id}" class="text-tao-accent hover:underline">↗ ${escapeHTML(linked.name.slice(0,18))}</button>`:''}</div>
            <div class="font-medium truncate">${escapeHTML(m.title|| m.content.slice(0,60))}</div>
            <div class="text-sm text-tao-secondary line-clamp-2">${escapeHTML(m.content)}</div>
            ${m.tags?.length? `<div class="flex gap-1 mt-1 flex-wrap">${m.tags.map(t=>`<span class="text-xs text-tao-muted">#${escapeHTML(t)}</span>`).join(' ')}</div>`:''}
          </div>
          <div class="hidden sm:flex gap-2 shrink-0">
            <button data-edit-mem="${m.id}" class="h-7 px-3 rounded-ctrl border border-tao-border text-xs">Edit</button>
            <button data-delete-mem="${m.id}" class="h-7 w-7 grid place-items-center rounded-ctrl border border-tao-border text-tao-muted">×</button>
          </div>
        </div>`
      }).join('') || '<div class="py-12 text-center"><p class="text-sm text-tao-muted">No memories yet.</p><p class="text-xs text-tao-muted mt-1">Capture goals, preferences, people, lessons — they will appear here.</p><button id="addMemBtn" class="mt-3 h-8 px-3 rounded-ctrl bg-tao-accent text-black text-sm">+ Remember</button></div>'}
    </div>
  </div>
  `
}

function viewDecisions(){
  const d=store.get()
  const q=(document.getElementById('globalSearch')?.value||'').toLowerCase()
  let decisions=d.decisions
  if(q) decisions=decisions.filter(dec=> (dec.title+' '+(dec.context||'')+' '+(dec.assumptions||[]).join(' ')+' '+(dec.evidence||[]).join(' ')+' '+(dec.expectedOutcome||'')+' '+(dec.outcome||'')).toLowerCase().includes(q))
  const pending = decisions.filter(d=>d.status==='pending')
  return `
  <div class="max-w-[960px] mx-auto px-4 md:px-6 py-8 space-y-6">
    <div class="flex items-baseline justify-between">
      <h1 class="font-display text-2xl font-semibold">Decisions</h1>
      <button id="addDecBtn" class="h-8 px-3 rounded-ctrl bg-tao-accent text-black text-sm font-medium">+ Log decision</button>
    </div>
    <p class="text-sm text-tao-muted">Lifecycle: pending → review → validated/invalidated. ${pending.length} pending${pending.length? ` • ${decisions.filter(d=>d.reviewDate && new Date(d.reviewDate) <= new Date(Date.now()+7*86400000)).length} due soon`:''}.</p>
    <div class="border-y border-tao-border divide-y divide-tao-border">
      ${decisions.map(dec=>{
        const isOverdue = dec.reviewDate && new Date(dec.reviewDate) < new Date() && dec.status==='pending'
        return `<div class="py-4">
          <div class="flex items-start justify-between gap-3">
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium truncate">${escapeHTML(dec.title)}</div>
              <div class="text-xs text-tao-muted truncate">${new Date(dec.created).toLocaleDateString()} • ${escapeHTML(dec.context||'no context')} ${dec.reviewDate? `• review ${escapeHTML(dec.reviewDate)}`:''} ${isOverdue? `<span class="text-tao-danger">• overdue</span>`:''}</div>
              <div class="text-xs text-tao-secondary mt-1 line-clamp-2">${(dec.assumptions||[]).slice(0,2).map(a=>escapeHTML(a)).join(' • ')||'no assumptions'} • ${dec.confidence}%</div>
            </div>
            <span class="shrink-0 h-6 px-2 rounded-full text-xs border ${dec.status==='validated'?'bg-tao-success text-black border-tao-success':dec.status==='invalidated'?'bg-tao-danger text-black border-tao-danger':'bg-transparent border-tao-border text-tao-muted'}">${escapeHTML(dec.status)}</span>
          </div>
          <div class="mt-3 flex items-center gap-2">
            <button data-edit-dec="${dec.id}" class="h-7 px-3 rounded-ctrl border border-tao-border text-xs">Open</button>
            <button data-validate="${dec.id}" class="h-7 px-3 rounded-ctrl bg-tao-raised border border-tao-border text-xs ${dec.status==='validated'?'hidden':''}">Validate</button>
            <button data-invalidate="${dec.id}" class="h-7 px-3 rounded-ctrl border border-tao-border text-xs ${dec.status==='invalidated'?'hidden':''}">Invalidate</button>
            <input data-outcome="${dec.id}" placeholder="Outcome" value="${escapeHTML(dec.outcome||'')}" class="flex-1 h-7 rounded-ctrl bg-tao-raised border border-tao-border px-3 text-xs hidden sm:block" />
            <button data-saveoutcome="${dec.id}" class="h-7 px-3 rounded-ctrl bg-tao-text text-black text-xs">Save</button>
          </div>
        </div>`
      }).join('') || '<div class="py-12 text-center"><p class="text-sm text-tao-muted">No decisions yet.</p><p class="text-xs text-tao-muted mt-1">Log what you decided, why, and when you will review it.</p></div>'}
    </div>
  </div>
  `
}

function viewIdeas(){
  const d=store.get()
  const q=(document.getElementById('globalSearch')?.value||'').toLowerCase()
  let list=d.ideas
  if(q) list=list.filter(i=> (i.title+i.description).toLowerCase().includes(q))
  list=[...list].sort((a,b)=> (b.total||0)-(a.total||0))
  return `
  <div class="p-4 md:p-6 max-w-[1100px] mx-auto space-y-4">
    <div class="flex items-center gap-3">
      <h1 class="text-2xl font-semibold">Idea Vault</h1>
      <span class="text-xs px-2 py-1 rounded-full bg-tao-accent text-black font-medium">Scored, not auto-promoted</span>
      <button id="addIdeaBtn" class="ml-auto h-9 px-4 rounded-xl bg-tao-accent text-black text-sm font-semibold">+ Capture idea</button>
    </div>
    <p class="text-sm text-tao-muted">Capture and score. Promotion to project requires ≥10/20 and a next action. This prevents proliferation.</p>
    <div class="grid md:grid-cols-2 gap-4">
      ${list.map(idea=>`
        <div class="rounded-2xl bg-tao-surface border border-tao-border p-4 flex flex-col">
          <div class="flex items-start justify-between gap-2">
            <h3 class="font-semibold leading-tight">${idea.title}</h3>
            <span class="shrink-0 text-xs px-2 py-1 rounded-full ${idea.total>=14?'bg-emerald-500 text-black': idea.total>=10?'bg-amber-400 text-black':'bg-tao-card border border-tao-border'}">${idea.total}/20</span>
          </div>
          <div class="text-sm text-tao-muted mt-1">${idea.description||''}</div>
          <div class="grid grid-cols-4 gap-2 mt-3">
            ${['novelty','feasibility','impact','alignment'].map(k=>`
              <label class="text-[11px] text-center">
                <div class="text-tao-muted capitalize">${k}</div>
                <select data-score="${idea.id}:${k}" class="w-full mt-1 h-8 rounded-lg bg-tao-card border border-tao-border text-center text-sm">
                  ${[1,2,3,4,5].map(n=>`<option ${idea.scores[k]===n?'selected':''}>${n}</option>`).join('')}
                </select>
              </label>
            `).join('')}
          </div>
          <div class="flex gap-2 mt-3">
            <span class="text-xs px-2 py-1 rounded-full bg-tao-card border border-tao-border">${idea.status}</span>
            <button data-promote="${idea.id}" class="ml-auto h-8 px-3 rounded-xl bg-white text-black text-xs font-medium disabled:opacity-40" ${idea.total<10?'disabled title="Need ≥10 to promote"':''}>Promote → Project</button>
            <button data-archiveidea="${idea.id}" class="h-8 px-3 rounded-xl bg-tao-card border border-tao-border text-xs">Archive</button>
          </div>
        </div>
      `).join('') || '<div class="p-8 text-center text-tao-muted col-span-2">No ideas. Capture fast, score later.</div>'}
    </div>
  </div>
  `
}

function viewPlanning(){
  const d=store.get()
  const mins = parseInt(document.getElementById('availMins')?.value || '120')
  const recs = recommend(d, mins)
  return `
  <div class="p-4 md:p-6 max-w-[1100px] mx-auto space-y-4">
    <h1 class="text-2xl font-semibold">Planning Engine</h1>
    <p class="text-sm text-tao-muted">Given <b>available time</b>, deadlines, strategic importance, effort and blockers — TAO ranks what you should work on next. No guessing.</p>
    <div class="rounded-2xl bg-tao-surface border border-tao-border p-4 flex flex-wrap gap-3 items-center">
      <label class="text-sm flex items-center gap-2">Available time <input id="availMins" type="range" min="30" max="360" step="15" value="${mins}" class="w-40 accent-tao-accent" /> <span class="font-mono text-sm w-16">${mins} min</span></label>
      <span class="text-xs text-tao-muted">Effort map: S≈10m M≈20m L≈45m XL≈90m (deep work units)</span>
      <button id="recalc" class="ml-auto h-8 px-4 rounded-xl bg-tao-card border border-tao-border text-xs">Re-rank</button>
    </div>

    <div class="space-y-3">
      ${recs.map(({p,score},i)=>`
        <div class="rounded-2xl border p-4 flex gap-4 items-center ${i===0?'bg-tao-accent text-black border-tao-accent':'bg-tao-surface border-tao-border'}">
          <div class="w-10 h-10 grid place-items-center rounded-xl font-mono font-bold text-sm ${i===0?'bg-black text-white':'bg-tao-card border border-tao-border'}">${i+1}</div>
          <div class="flex-1 min-w-0">
            <div class="font-semibold truncate">${p.name} <span class="font-normal text-xs ${i===0?'text-zinc-700':'text-tao-muted'}">• ${p.area}</span></div>
            <div class="text-sm ${i===0?'text-zinc-800':'text-tao-muted'} truncate">Next: <b class="${i===0?'text-black':''}">${p.nextAction}</b></div>
            <div class="text-xs ${i===0?'text-zinc-600':'text-tao-muted'}">${p.deadline? `Due ${fmtDate(p.deadline)} (${daysLeft(p.deadline)}d)`: 'No deadline'} • Importance ${p.strategicImportance}/5 • Effort ${p.effort} • ${p.blockers?.length?'Blocked':'Ready'}</div>
          </div>
          <div class="text-right">
            <div class="font-mono text-lg font-bold">${score}</div><div class="text-[11px] ${i===0?'text-zinc-600':'text-tao-muted'}">/100</div>
          </div>
          <button data-start="${p.id}" class="hidden sm:inline h-9 px-4 rounded-xl ${i===0?'bg-black text-white':'bg-white text-black'} text-sm font-medium">Start</button>
        </div>
      `).join('') || '<div class="p-8 text-center text-tao-muted">No active projects to rank.</div>'}
    </div>

    <div class="rounded-2xl bg-tao-card border border-tao-border p-4">
      <h3 class="font-semibold text-sm">How scoring works</h3>
      <p class="text-xs text-tao-muted mt-1">Importance (30) + Urgency (35) + Effort fit (12) + Near-complete bonus (8) − Blockers (12+) − Dependencies (5) − Missing next action (−100). Overdue = +35. TAO forces you to confront tradeoffs.</p>
    </div>
  </div>
  `
}

function viewWeekly(){
  const d=store.get()
  const a=weeklyAnalysis(d)
  const weekSessions = a.weekSessions||[]
  const totalMins = a.totalFocusMins||0
  const studyMins = a.totalStudyMins||0
  const planned = a.totals.plannedMins||0
  const actual = a.totals.actualMins||0
  const pct = a.totals.plannedVsActual
  const advanced = d.projects.filter(p=>{
    const upd = new Date(p.updated||p.created) > new Date(Date.now()-7*86400000)
    const sess = weekSessions.find(s=>s.projectId===p.id)
    return upd || sess
  })
  const stalled = a.stale
  const byProject = a.sessionsByProject||{}
  const topProjects = Object.entries(byProject).sort((x,y)=>y[1]-x[1]).slice(0,5)
  const pendingReview = d.decisions.filter(dec=> dec.reviewDate && new Date(dec.reviewDate) <= new Date(Date.now()+7*86400000) && dec.status==='pending')
  return `
  <div class="max-w-[960px] mx-auto px-4 md:px-6 py-8 space-y-8">
    <div class="space-y-2">
      <h1 class="font-display text-2xl font-semibold">Weekly Review</h1>
      <p class="text-sm text-tao-muted">A quiet look at the past 7 days — what moved, what stalled, where your time went.</p>
    </div>
    <div class="space-y-2">
      <h2 class="font-display text-base font-medium">What moved forward</h2>
      ${advanced.length? `<div class="divide-y divide-tao-border border-y border-tao-border">${advanced.map(p=>`<div class="flex items-center justify-between py-3"><div><div class="text-sm font-medium">${escapeHTML(p.name)}</div><div class="text-xs text-tao-muted truncate">${escapeHTML(p.nextAction)}</div></div><span class="text-xs text-tao-success">● moved</span></div>`).join('')}</div>`:'<div class="rounded-panel border border-tao-border p-6 text-center text-sm text-tao-muted">Nothing moved this week — start a focus session.</div>'}
    </div>
    <div class="space-y-2">
      <h2 class="font-display text-base font-medium">Where time went</h2>
      <div class="rounded-panel bg-tao-surface border border-tao-border p-4">
        <div class="flex items-baseline gap-4 text-sm"><span class="text-2xl font-mono font-medium">${totalMins}m</span><span class="text-tao-muted">focus</span><span class="text-tao-muted">•</span><span>${weekSessions.length} sessions</span><span class="text-tao-muted">•</span><span>${studyMins}m study</span></div>
        <div class="mt-3 space-y-2">
          ${topProjects.length? topProjects.map(([pid,mins])=>{
            const proj = d.projects.find(p=>p.id===pid)
            const name = proj ? proj.name : pid
            return `<div class="flex items-center gap-3 text-sm"><span class="flex-1 truncate text-tao-secondary">${escapeHTML(name)}</span><span class="text-xs font-mono">${mins}m</span></div>`
          }).join('') : '<div class="text-sm text-tao-muted">No time logged yet.</div>'}
        </div>
        <div class="mt-4 pt-4 border-t border-tao-border flex items-center gap-3 text-sm">
          <span class="text-tao-muted">Planned</span><span class="font-mono">${planned}m</span><span class="text-tao-muted">Actual</span><span class="font-mono">${actual}m</span><span class="ml-auto text-xs px-2 py-1 rounded-full ${pct!==null && pct>=80?'bg-tao-success text-black':pct!==null && pct>=50?'bg-tao-warning text-black':'bg-tao-raised border border-tao-border text-tao-muted'}">${pct!==null? pct+'%':''} ${pct!==null && pct>=80?'on track':pct!==null?'at risk':''}</span>
        </div>
      </div>
    </div>
    <div class="space-y-2">
      <h2 class="font-display text-base font-medium">What stalled</h2>
      ${stalled.length? `<div class="divide-y divide-tao-border border-y border-tao-border">${stalled.map(p=>`<div class="flex items-center justify-between py-3"><span class="truncate text-sm">${escapeHTML(p.name)}</span><button data-open-project="${p.id}" class="text-xs text-tao-accent">Open →</button></div>`).join('')}</div>`:'<div class="text-sm text-tao-muted">Nothing stalled — all projects touched recently.</div>'}
    </div>
    <div class="space-y-2">
      <h2 class="font-display text-base font-medium">Decisions due</h2>
      <div class="rounded-panel border border-tao-border divide-y divide-tao-border">
        ${pendingReview.length? pendingReview.map(dec=>`<div class="flex items-center justify-between p-3"><div><div class="text-sm font-medium">${escapeHTML(dec.title)}</div><div class="text-xs text-tao-muted">Review ${escapeHTML(dec.reviewDate)} • ${dec.confidence}%</div></div><button data-edit-dec="${dec.id}" class="text-xs text-tao-accent">Review</button></div>`).join(''):'<div class="p-4 text-sm text-tao-muted text-center">No reviews due — decisions are current.</div>'}
      </div>
        </div>
        <div class="rounded-2xl bg-tao-accent text-black p-4">
          <h3 class="font-semibold text-sm">Next-week recommendations</h3>
          <ul class="text-sm mt-2 space-y-1 list-disc ml-4">
            ${a.bottlenecks.length? a.bottlenecks.map(b=>`<li>${escapeHTML(b)}</li>`).join(''):'<li>Keep shipping — no bottlenecks</li>'}
            ${totalMins<120? '<li>Schedule 3×25m focus blocks (low focus time)</li>':''}
            ${pendingReview.length? `<li>Review ${pendingReview.length} pending decisions</li>`:''}
          </ul>
        </div>
        <div class="rounded-2xl bg-tao-surface border border-tao-border p-4">
          <h3 class="font-semibold text-sm">Bottlenecks</h3>
          <div class="mt-2 space-y-2 text-xs">${a.bottlenecks.length? a.bottlenecks.map(b=>`<div class="rounded-xl bg-tao-card border border-tao-border p-2">${escapeHTML(b)}</div>`).join(''):'<div class="text-emerald-400">✓ No bottlenecks</div>'}</div>
        </div>
      </div>
    </div>
  </div>
  `
}

function viewDev(){
  const isConnected = devSnapshot.connected && devSnapshot.name
  return `
  <div class="max-w-[960px] mx-auto px-4 md:px-6 py-8 space-y-6">
    <div class="flex items-baseline justify-between">
      <h1 class="font-display text-2xl font-semibold">Developer</h1>
      <div class="flex gap-2">
        <button id="pickRepo" class="h-8 px-3 rounded-ctrl bg-tao-accent text-black text-sm font-medium">Connect folder</button>
        <button id="refreshDev" class="h-8 px-3 rounded-ctrl bg-tao-raised border border-tao-border text-sm">Refresh</button>
      </div>
    </div>
    ${!isConnected ? `<div class="rounded-panel border border-tao-border p-8 text-center">
      <div class="w-10 h-10 rounded-full bg-tao-raised border border-tao-border grid place-items-center mx-auto text-tao-muted">◈</div>
      <h3 class="font-medium mt-3">No repository connected</h3>
      <p class="text-sm text-tao-muted mt-1 max-w-[480px] mx-auto">Pick a local folder (Chrome/Edge) to inspect real files, TODOs and recent changes. No data is fabricated — disconnected state is honest.</p>
      <p class="text-xs text-tao-muted mt-2">File System Access API required. Firefox/Safari show this empty state.</p>
    </div>` : `
    <div class="flex items-center gap-2 text-sm"><span class="w-2 h-2 rounded-full bg-tao-success"></span><span class="font-mono">${escapeHTML(devSnapshot.name)}</span><span class="text-xs px-2 py-0.5 rounded-full bg-tao-raised border border-tao-border">${escapeHTML(devSnapshot.branch||'main')}</span><span class="text-xs text-tao-muted">${devSnapshot.dirty?'dirty':'clean'}</span><span class="text-xs text-tao-muted">• ${devSnapshot.hasGit?'git':'no git'}</span></div>
    <div class="border-y border-tao-border divide-y divide-tao-border">
      <div class="py-4">
        <div class="text-sm font-medium">Recent commits</div>
        ${devSnapshot.commits.length? `<div class="mt-2 space-y-2 font-mono text-xs">${devSnapshot.commits.map(c=>`<div class="flex gap-3"><span class="text-tao-accent">${escapeHTML(c.hash)}</span><span class="flex-1 truncate">${escapeHTML(c.msg)}</span><span class="text-tao-muted">${escapeHTML(c.ago)}</span></div>`).join('')}</div>`:'<div class="text-sm text-tao-muted mt-1">No commits — .git not readable via File System Access (honest).</div>'}
      </div>
      <div class="py-4">
        <div class="text-sm font-medium">Recent changes</div>
        <div class="mt-2 divide-y divide-tao-border/50">
          ${devSnapshot.recent.length? devSnapshot.recent.map(r=>`<div class="flex justify-between py-2 text-sm"><span class="truncate">${escapeHTML(r.file)}</span><span class="text-xs text-tao-muted">${new Date(r.modified).toLocaleDateString()} • ${(r.size/1024).toFixed(1)}KB</span></div>`).join(''):'<div class="text-sm text-tao-muted">No files scanned yet.</div>'}
        </div>
      </div>
      <div class="py-4">
        <div class="text-sm font-medium">TODOs</div>
        <div class="mt-2 space-y-2">${devSnapshot.todos.length? devSnapshot.todos.map(t=>`<div class="py-2 border-b border-tao-border/50 last:border-0"><div class="font-mono text-xs">${escapeHTML(t.file)} (${t.count})</div><div class="text-xs text-tao-muted mt-1">${escapeHTML(t.lines.join(' • '))}</div></div>`).join(''):'<div class="text-sm text-tao-muted">No TODOs found.</div>'}</div>
      </div>
    </div>
    `}
    <div class="rounded-panel bg-tao-raised border border-tao-border p-4">
      <div class="text-sm font-medium">Where did you stop?</div>
      <p class="text-sm text-tao-muted mt-1">${isConnected && devSnapshot.todos[0] ? `Last TODO in ${escapeHTML(devSnapshot.todos[0].file)}` : 'Connect a folder to see where you stopped, or check git diff.'}</p>
      <button id="addDevProject" class="mt-3 h-8 px-3 rounded-ctrl bg-tao-text text-black text-xs font-medium ${isConnected && devSnapshot.todos[0]?'':'opacity-50 pointer-events-none'}">Create project from TODO</button>
    </div>
  </div>
  `
}

function viewStudy(){
  const d=store.get()
  const q=(document.getElementById('globalSearch')?.value||'').toLowerCase()
  let courses=d.courses
  if(q) courses=courses.filter(c=> (c.code+' '+c.name+' '+(c.topics||[]).join(' ')+' '+(c.weakAreas||[]).join(' ')).toLowerCase().includes(q))
  return `
  <div class="max-w-[960px] mx-auto px-4 md:px-6 py-8 space-y-6">
    <div class="flex items-baseline justify-between">
      <h1 class="font-display text-2xl font-semibold">Study</h1>
      <div class="flex gap-2">
        <button id="addCourseBtn" class="h-8 px-3 rounded-ctrl bg-tao-accent text-black text-sm font-medium">+ Course</button>
        <button id="logSessionBtn" class="h-8 px-3 rounded-ctrl bg-tao-raised border border-tao-border text-sm">Log session</button>
      </div>
    </div>
    <div class="grid md:grid-cols-3 gap-6">
      <div class="md:col-span-2 border-y border-tao-border divide-y divide-tao-border">
        ${courses.map(c=>`
          <div class="flex gap-4 py-4">
            <div class="flex-1 min-w-0">
              <div class="flex items-baseline gap-2"><span class="font-mono text-xs text-tao-muted">${escapeHTML(c.code)}</span><h3 class="font-medium truncate">${escapeHTML(c.name)}</h3><span class="text-xs text-tao-muted">· ${c.priority}/5</span></div>
              <div class="text-sm text-tao-secondary truncate">${escapeHTML(c.topics.join(' • ')||'No topics')}</div>
              <div class="text-xs text-tao-muted mt-1">${c.weakAreas?.length? `<span class="text-tao-warning">${escapeHTML(c.weakAreas.join(', '))} — weak</span>`:'No weak areas'} • ${c.deadlines.length? escapeHTML(c.deadlines.map(d=>`${d.title} ${fmtDate(d.date)}`).join(', ')):'No deadlines'}</div>
            </div>
            <div class="hidden sm:flex flex-col gap-2 shrink-0">
              <button data-study="${c.id}" class="h-7 px-3 rounded-ctrl bg-tao-text text-black text-xs">Study</button>
              <button data-editcourse="${c.id}" class="h-7 px-3 rounded-ctrl border border-tao-border text-xs">Edit</button>
            </div>
          </div>
        `).join('') || '<div class="py-12 text-center"><p class="text-sm text-tao-muted">No courses yet.</p><p class="text-xs text-tao-muted mt-1">Add your semester courses to track weak areas and deadlines.</p></div>'}
      </div>
      <div class="space-y-4">
        <div class="rounded-panel bg-tao-raised border border-tao-border p-4">
          <div class="text-sm font-medium">Revision priority</div>
          <div class="mt-2 space-y-2 text-sm">
            ${[...d.courses].sort((a,b)=> (b.priority - a.priority) || (b.weakAreas.length - a.weakAreas.length)).slice(0,3).map(c=>`<div class="flex justify-between py-1 border-b border-tao-border/50 last:border-0"><span class="truncate pr-2">${escapeHTML(c.code)} — ${escapeHTML(c.name)}</span><span class="text-xs text-tao-muted">${c.weakAreas.length? escapeHTML(c.weakAreas[0]) : 'review'}</span></div>`).join('') || '<span class="text-sm text-tao-muted">No courses</span>'}
          </div>
        </div>
        <div class="rounded-panel border border-tao-border p-4">
          <h3 class="font-medium text-sm">Recent sessions</h3>
          <div class="mt-2 divide-y divide-tao-border">
            ${d.sessions.filter(s=>s.type==='study').slice(0,6).map(s=>`<div class="flex justify-between py-2 text-sm"><span class="truncate">${escapeHTML(s.courseCode||'—')} • ${s.mins}m</span><span class="text-xs text-tao-muted">${new Date(s.date).toLocaleDateString()}</span></div>`).join('') || '<div class="py-4 text-center text-sm text-tao-muted">No sessions yet — log a study session.</div>'}
          </div>
        </div>
      </div>
    </div>
  </div>
  <dialog id="courseDialog" class="rounded-dialog p-0 border border-tao-border bg-tao-surface text-white w-[min(560px,92vw)] md:w-[min(560px,95vw)] backdrop:bg-black/60">
    <form method="dialog" id="courseForm" class="p-6 space-y-4">
      <h3 class="font-display text-lg font-semibold">Add / Edit Course</h3>
      <input type="hidden" id="courseId" />
      <div class="grid grid-cols-2 gap-3">
        <label class="block text-xs">Code<input id="courseCode" required placeholder="CSC 421" class="mt-1 w-full h-10 rounded-ctrl bg-tao-card border border-tao-border px-3 text-sm outline-none" /></label>
        <label class="block text-xs">Priority (1-5)<input id="coursePriority" type="number" min="1" max="5" value="3" class="mt-1 w-full h-10 rounded-ctrl bg-tao-card border border-tao-border px-3 text-sm" /></label>
      </div>
      <label class="block text-xs">Name<input id="courseName" required placeholder="Algorithms" class="mt-1 w-full h-10 rounded-ctrl bg-tao-card border border-tao-border px-3 text-sm outline-none" /></label>
      <label class="block text-xs">Topics (comma separated)<input id="courseTopics" placeholder="DP, Graphs, Greedy" class="mt-1 w-full h-10 rounded-ctrl bg-tao-card border border-tao-border px-3 text-sm" /></label>
      <label class="block text-xs">Weak areas (comma separated)<input id="courseWeak" placeholder="DP, Amortized analysis" class="mt-1 w-full h-10 rounded-ctrl bg-tao-card border border-tao-border px-3 text-sm" /></label>
      <label class="block text-xs">Deadlines (e.g., Test 1: 2026-09-10, Exam: 2026-10-01)<input id="courseDeadlines" placeholder="Test 1: 2026-09-10" class="mt-1 w-full h-10 rounded-ctrl bg-tao-card border border-tao-border px-3 text-sm" /></label>
      <div class="flex gap-2 justify-between pt-2">
        <button type="button" id="deleteCourse" class="h-10 px-4 rounded-ctrl border border-red-500/30 text-red-300 text-sm hidden">Delete</button>
        <div class="ml-auto flex gap-2">
          <button value="cancel" class="h-10 px-4 rounded-ctrl bg-tao-card border border-tao-border text-sm">Cancel</button>
          <button id="saveCourse" value="default" class="h-10 px-5 rounded-ctrl bg-tao-accent text-black text-sm font-semibold">Save</button>
        </div>
      </div>
    </form>
  </dialog>
  `
}

function viewBusiness(){
  const d=store.get()
  const q=(document.getElementById('globalSearch')?.value||'').toLowerCase()
  let opportunities=d.opportunities
  if(q) opportunities=opportunities.filter(o=> (o.title+' '+(o.assumptions||[]).join(' ')+' '+(o.evidence||[]).join(' ')).toLowerCase().includes(q))
  return `
  <div class="max-w-[960px] mx-auto px-4 md:px-6 py-8 space-y-6">
    <div class="flex items-baseline justify-between">
      <h1 class="font-display text-2xl font-semibold">Business</h1>
      <button id="addOppBtn" class="h-8 px-3 rounded-ctrl bg-tao-accent text-black text-sm font-medium">+ Opportunity</button>
    </div>
    <div class="border-y border-tao-border divide-y divide-tao-border">
      ${opportunities.map(o=>`
        <div class="flex gap-4 py-4">
          <div class="flex-1 min-w-0">
            <div class="flex items-baseline gap-2"><h3 class="font-medium truncate">${escapeHTML(o.title)}</h3><span class="text-xs px-2 py-0.5 rounded-full border ${o.stage==='revenue'?'bg-tao-success text-black border-tao-success':o.stage==='building'?'bg-tao-warning text-black border-tao-warning':'bg-transparent border-tao-border text-tao-muted'}">${escapeHTML(o.stage)}</span></div>
            <div class="text-xs text-tao-muted mt-1">${o.revenue? `₦${escapeHTML(Number(o.revenue).toLocaleString('en-NG'))}`:'₦0'} • ${o.prospects?.length||0} prospects • ${o.evidence.length}/${o.assumptions.length} evidence</div>
            <div class="text-xs text-tao-secondary mt-1 truncate">${o.assumptions.slice(0,2).map(a=>escapeHTML(a)).join(' • ')||'No assumptions'} → ${o.evidence.slice(0,2).map(e=>escapeHTML(e)).join(' • ')||'no evidence yet'}</div>
          </div>
          <div class="hidden sm:flex flex-col gap-2 shrink-0">
            <button data-oppnext="${o.id}" class="h-7 px-3 rounded-ctrl bg-tao-raised border border-tao-border text-xs">Validate</button>
            <button data-editopp="${o.id}" class="h-7 px-3 rounded-ctrl border border-tao-border text-xs">Edit</button>
          </div>
        </div>
      `).join('') || '<div class="py-12 text-center"><p class="text-sm text-tao-muted">No opportunities yet.</p><p class="text-xs text-tao-muted mt-1">Capture an opportunity and validate with real evidence.</p></div>'}
    </div>
    <div class="rounded-panel bg-tao-raised border border-tao-border p-4">
      <div class="flex items-center justify-between text-sm">
        ${['idea','validation','building','revenue'].map(s=>{
          const count=d.opportunities.filter(o=>o.stage===s).length
          return `<div class="text-center"><div class="font-mono text-lg">${count}</div><div class="text-xs text-tao-muted capitalize">${escapeHTML(s)}</div></div>`
        }).join('<span class="text-tao-border">→</span>')}
      </div>
    </div>
  </div>
  <dialog id="oppDialog" class="rounded-dialog p-0 border border-tao-border bg-tao-surface text-white w-[min(600px,92vw)] md:w-[min(600px,95vw)] backdrop:bg-black/60">
    <form method="dialog" id="oppForm" class="p-6 space-y-4">
      <h3 class="font-display text-lg font-semibold">Add / Edit Opportunity</h3>
      <input type="hidden" id="oppId" />
      <label class="block text-xs">Title<input id="oppTitle" required placeholder="Laundry Aggregator — Hall B" class="mt-1 w-full h-10 rounded-ctrl bg-tao-card border border-tao-border px-3 text-sm outline-none" /></label>
      <div class="grid grid-cols-2 gap-3">
        <label class="block text-xs">Stage<select id="oppStage" class="mt-1 w-full h-10 rounded-ctrl bg-tao-card border border-tao-border px-3 text-sm"><option value="idea">idea</option><option value="validation">validation</option><option value="building">building</option><option value="revenue">revenue</option></select></label>
        <label class="block text-xs">Revenue (₦)<input id="oppRevenue" type="number" placeholder="0" class="mt-1 w-full h-10 rounded-ctrl bg-tao-card border border-tao-border px-3 text-sm" /></label>
      </div>
      <label class="block text-xs">Assumptions (comma separated)<input id="oppAssumptions" placeholder="Students pay ₦800/basket" class="mt-1 w-full h-10 rounded-ctrl bg-tao-card border border-tao-border px-3 text-sm" /></label>
      <label class="block text-xs">Validation evidence (comma separated)<input id="oppEvidence" placeholder="5 interviews — 4 said yes" class="mt-1 w-full h-10 rounded-ctrl bg-tao-card border border-tao-border px-3 text-sm" /></label>
      <div class="rounded-xl bg-tao-card border border-tao-border p-3">
        <div class="text-xs font-mono">Validation score: <span id="oppScore" class="font-bold">—</span> <span class="text-tao-muted">(evidence / assumptions)</span></div>
        <div class="text-[11px] text-tao-muted mt-1">Score = evidence items ÷ max(1, assumptions). High score + evidence unlocks “revenue”.</div>
      </div>
      <div class="flex gap-2 justify-between pt-2">
        <button type="button" id="deleteOpp" class="h-10 px-4 rounded-ctrl border border-red-500/30 text-red-300 text-sm hidden">Delete</button>
        <div class="ml-auto flex gap-2">
          <button value="cancel" class="h-10 px-4 rounded-ctrl bg-tao-card border border-tao-border text-sm">Cancel</button>
          <button id="saveOpp" value="default" class="h-10 px-5 rounded-ctrl bg-tao-accent text-black text-sm font-semibold">Save</button>
        </div>
      </div>
    </form>
  </dialog>
  `
}

// --- Renderer ---
function viewSettings(){
  const d=store.get()
  const size=(new Blob([JSON.stringify(d)]).size/1024).toFixed(1)
  return `
  <div class="p-6 max-w-[700px] mx-auto space-y-6">
    <h1 class="text-2xl font-semibold">Settings</h1>
    <div class="rounded-2xl bg-tao-surface border border-tao-border p-6 space-y-4">
      <div class="flex justify-between"><span class="text-sm text-tao-muted">Schema</span><span class="font-mono text-sm">tao.v1 • v${d.meta.version} • ${d.meta.seeded?'seeded':'not seeded'}</span></div>
      <div class="flex justify-between"><span class="text-sm text-tao-muted">Storage</span><span class="font-mono text-sm">${size} KB • ${d.projects.length} projects • ${d.sessions.length} sessions</span></div>
      <div class="flex justify-between"><span class="text-sm text-tao-muted">AI Provider</span><span class="text-sm">${escapeHTML(d.settings.aiProvider)} • ${d.settings.aiKey?'key set':'no key (mock)'}</span></div>
      <div class="pt-4 border-t border-tao-border flex gap-3">
        <button id="exportBtn2" class="h-10 px-4 rounded-ctrl bg-tao-card border border-tao-border text-sm">Export JSON</button>
        <label class="h-10 px-4 rounded-ctrl bg-tao-card border border-tao-border text-sm grid place-items-center cursor-pointer">Import<input id="importFile2" type="file" accept=".json" class="hidden"></label>
        <button id="resetBtn" class="h-10 px-4 rounded-ctrl border border-red-500/30 text-red-300 text-sm">Reset all data</button>
      </div>
      <p class="text-xs text-tao-muted">Exports exclude API keys. Reset is destructive — export first.</p>
    </div>
  </div>
  `
}
function render(){
  const el=document.getElementById('content')
  let html=''
  if(current==='command') html=viewCommand()
  else if(current==='focus') html=viewFocus()
  else if(current==='project') html=viewProject()
  else if(current==='projects') html=viewProjects()
  else if(current==='memory') html=viewMemory()
  else if(current==='decisions') html=viewDecisions()
  else if(current==='ideas') html=viewIdeas()
  else if(current==='planning') html=viewPlanning()
  else if(current==='weekly') html=viewWeekly()
  else if(current==='dev') html=viewDev()
  else if(current==='study') html=viewStudy()
  else if(current==='business') html=viewBusiness()
  else if(current==='settings') html=viewSettings()
  el.innerHTML=html
  bind()
  const label = current==='project' ? (store.get().projects.find(p=>p.id===activeProjectId)?.name || 'Project') : (routes.find(r=>r.id===current)?.label || current)
  document.getElementById('statusLeft').textContent = `TAO • ${label} • local-first`
}

function bind(){
  // Command
  document.getElementById('saveDaily')?.addEventListener('click', async ()=>{
    const btn=document.getElementById('saveDaily')
    const orig=btn.textContent
    btn.textContent='Saving…'; btn.disabled=true; btn.classList.add('opacity-50')
    try{
      const prios=[0,1,2].map(i=> document.querySelector(`[data-prio="${i}"]`)?.value.trim()).filter(Boolean)
      const blockers=(document.getElementById('dailyBlockers')?.value||'').split('\n').map(s=>s.trim()).filter(Boolean)
      const timeBlocks=['deep','admin','classes'].map(k=>{
        const inp=document.querySelector(`[data-time="${k}"]`)
        return { k, mins: parseInt(inp?.value||'0') }
      })
      if(prios.length===0) throw new Error('Add at least one priority')
      const d=store.get()
      d.daily[todayISO()] = { priorities: prios, blockers, timeBlocks, nextActions: prios }
      store.set({ daily: d.daily })
      btn.textContent='Saved ✓'; btn.classList.remove('opacity-50'); btn.classList.add('bg-emerald-500','text-black')
      toast('Day saved locally ✓')
      setTimeout(()=>{ btn.textContent=orig; btn.disabled=false; btn.classList.remove('bg-emerald-500','text-black'); }, 1500)
    }catch(e){
      btn.textContent='Error'; btn.classList.add('bg-red-500','text-white')
      toast('Save failed: '+e.message)
      setTimeout(()=>{ btn.textContent=orig; btn.disabled=false; btn.classList.remove('bg-red-500','text-white','opacity-50'); }, 2000)
    }
  })
  document.querySelectorAll('[data-done]').forEach(cb=>{
    cb.addEventListener('change', (e)=>{
      const id=e.target.dataset.done
      const p=store.get().projects.find(x=>x.id===id)
      if(p && e.target.checked){
        if(confirm(`Mark next action done for "${p.name}"? You'll need to define the next one.`)){
          const next = prompt('What is the NEXT physical action?', '')
          if(next) store.updateProject(id, { nextAction: next })
          else e.target.checked=false
          render()
        } else e.target.checked=false
      }
    })
  })
  document.querySelectorAll('[data-focus]').forEach(b=>{
    b.addEventListener('click', ()=>{
      const p=store.get().projects.find(x=>x.id===b.dataset.focus)
      if(p) alert(`Focus: ${p.nextAction}\n\nTAO: Do this one thing. No context switch for 25 min.`)
    })
  })

  // Projects
  document.getElementById('newProjectBtn')?.addEventListener('click', ()=> openProjDialog())
  document.querySelectorAll('[data-edit]').forEach(b=> b.addEventListener('click', ()=> openProjDialog(b.dataset.edit)))
  document.querySelectorAll('[data-advance]').forEach(b=> b.addEventListener('click', ()=>{
    const id=b.dataset.advance
    const p=store.get().projects.find(x=>x.id===id)
    const next=prompt(`Update next physical action for "${p.name}"`, p.nextAction)
    if(next!==null){
      try{ store.updateProject(id, { nextAction: next }); render(); toast('Updated ✓') }catch(e){ alert(e.message) }
    }
  }))
  document.getElementById('saveProj')?.addEventListener('click', (e)=>{
    e.preventDefault()
    const id=document.getElementById('projId').value
    const payload={
      name: document.getElementById('projName').value.trim(),
      objective: document.getElementById('projObj').value.trim(),
      area: document.getElementById('projArea').value,
      effort: document.getElementById('projEffort').value,
      strategicImportance: parseInt(document.getElementById('projImp').value),
      deadline: document.getElementById('projDeadline').value || null,
      status: document.getElementById('projStatus').value,
      nextAction: document.getElementById('projNext').value.trim(),
      blockers: document.getElementById('projBlockers').value.split(',').map(s=>s.trim()).filter(Boolean),
      milestones: document.getElementById('projMilestones').value.split(',').map(s=>s.trim()).filter(Boolean),
      dependencies: document.getElementById('projDeps').value.split(',').map(s=>s.trim()).filter(Boolean),
    }
    if(!payload.name) return alert('Name required')
    try{
      if(id) store.updateProject(id, payload)
      else store.addProject(payload)
      document.getElementById('projDialog').close()
      render(); toast('Project saved — enforcement passed ✓')
    }catch(err){ alert(err.message) }
  })
  document.getElementById('deleteProj')?.addEventListener('click', ()=>{
    const id=document.getElementById('projId').value
    if(id && confirm('Delete project?')){ store.deleteProject(id); document.getElementById('projDialog').close(); render() }
  })
  document.getElementById('sortProjects')?.addEventListener('change', (e)=>{
    projectSort = e.target.value
    localStorage.setItem('tao.projectSort', projectSort)
    render()
  })
  document.querySelectorAll('[data-filter]').forEach(b=>{
    b.addEventListener('click', ()=>{
      projectFilter = b.dataset.filter
      localStorage.setItem('tao.projectFilter', projectFilter)
      render()
    })
  })

  // Memory
  document.getElementById('addMemBtn')?.addEventListener('click', ()=>{
    const title=prompt('Title (optional)')
    const content=prompt('What do you want TAO to remember?')
    if(!content) return
    const type=prompt('Type: project, decision, goal, preference, knowledge, person, business, academic, technology, idea', 'knowledge') || 'knowledge'
    store.addMemory({ title, content, type })
    render(); toast('Remembered ✓')
  })
  document.querySelectorAll('[data-memfilter]').forEach(b=>{
    b.addEventListener('click', ()=>{
      memoryFilter = b.dataset.memfilter
      render()
    })
  })

  // Decisions
  document.getElementById('addDecBtn')?.addEventListener('click', ()=>{
    const title=prompt('Decision title?')
    if(!title) return
    const context=prompt('Context?')||''
    const assumptions=(prompt('Assumptions (comma separated)')||'').split(',').map(s=>s.trim()).filter(Boolean)
    const confidence=parseInt(prompt('Confidence 0-100?','60')||'60')
    store.addDecision({ title, context, assumptions, confidence })
    render()
  })
  document.querySelectorAll('[data-validate]').forEach(b=> b.addEventListener('click', ()=>{ store.updateDecision(b.dataset.validate, { status:'validated' }); render() }))
  document.querySelectorAll('[data-invalidate]').forEach(b=> b.addEventListener('click', ()=>{ store.updateDecision(b.dataset.invalidate, { status:'invalidated' }); render() }))
  document.querySelectorAll('[data-saveoutcome]').forEach(b=> b.addEventListener('click', ()=>{
    const id=b.dataset.saveoutcome
    const val=document.querySelector(`[data-outcome="${id}"]`)?.value
    store.updateDecision(id, { outcome: val }); toast('Outcome saved'); render()
  }))

  // Ideas
  document.getElementById('addIdeaBtn')?.addEventListener('click', ()=>{
    const title=prompt('Idea title?')
    if(!title) return
    const desc=prompt('Describe in one sentence')||''
    store.addIdea({ title, description: desc })
    render()
  })
  document.querySelectorAll('[data-score]').forEach(sel=>{
    sel.addEventListener('change', (e)=>{
      const [id,k]=e.target.dataset.score.split(':')
      const v=parseInt(e.target.value)
      store.scoreIdea(id, { [k]: v })
      render(); toast('Scored')
    })
  })
  document.querySelectorAll('[data-promote]').forEach(b=>{
    b.addEventListener('click', ()=>{
      try{
        const idea=store.get().ideas.find(x=>x.id===b.dataset.promote)
        const next=prompt(`Promote "${idea.title}" — define the FIRST physical next action (required):`, '')
        if(!next) return
        const proj = store.addProject({ name: idea.title, objective: idea.description, area:'technology', strategicImportance: 3, effort:'M', nextAction: next, linkedIdeaId: idea.id })
        store.promoteIdea(b.dataset.promote, proj.id)
        // also store reverse link
        idea.linkedProjectId = proj.id
        toast('Promoted to project ✓')
        render()
      }catch(e){ alert(e.message) }
    })
  })
  document.querySelectorAll('[data-archiveidea]').forEach(b=>{
    b.addEventListener('click', ()=>{
      const d=store.get()
      const it=d.ideas.find(x=>x.id===b.dataset.archiveidea)
      if(it) it.status='archived'
      store.set({ ideas: d.ideas }); render()
    })
  })

  // Planning
  document.getElementById('availMins')?.addEventListener('input', (e)=>{
    const v=e.target.value
    const label=e.target.parentElement.querySelector('span.font-mono')
    if(label) label.textContent=`${v} min`
  })
  document.getElementById('recalc')?.addEventListener('click', render)
  document.querySelectorAll('[data-start]').forEach(b=>{
    b.addEventListener('click', ()=>{
      const p=store.get().projects.find(x=>x.id===b.dataset.start)
      alert(`Start: ${p.nextAction}\n\nTAO: Set a 25-min timer. No switching.`)
    })
  })

  // Dev
  document.getElementById('pickRepo')?.addEventListener('click', async()=>{
    try{
      const dir=await pickRepoDirectory()
      const snap=await scanDirectory(dir)
      // merge into mock shape
      devSnapshot={ ...devSnapshot, name: snap.name, hasGit: snap.hasGit, todos: snap.todos, recent: snap.recent }
      toast(`Scanned ${snap.files.length} files — ${snap.todos.length} TODOs found`)
      render()
    }catch(e){ alert(e.message) }
  })
  document.getElementById('refreshDev')?.addEventListener('click', ()=>{ devSnapshot=mockDevSnapshot(); render() })
  document.getElementById('addDevProject')?.addEventListener('click', ()=>{
    const todo=devSnapshot.todos[0]
    if(!todo) return alert('No TODOs to convert')
    const next=prompt(`Create project from TODO in ${todo.file} — define next action`, `Fix TODO: ${todo.lines[0].slice(0,60)}`)
    if(!next) return
    try{ store.addProject({ name:`Dev — ${todo.file}`, objective: todo.lines.join('; ').slice(0,120), area:'technology', effort:'S', strategicImportance:3, nextAction: next }); toast('Project created'); render() }catch(e){ alert(e.message) }
  })

  // Study
  document.getElementById('addCourseBtn')?.addEventListener('click', ()=> openCourseDialog())
  document.querySelectorAll('[data-editcourse]').forEach(b=> b.addEventListener('click', ()=> openCourseDialog(b.dataset.editcourse)))
  document.getElementById('deleteCourse')?.addEventListener('click', ()=>{
    const id=document.getElementById('courseId').value
    if(id && confirm('Delete course?')){
      const d=store.get()
      d.courses = d.courses.filter(c=>c.id!==id)
      store.set({ courses: d.courses })
      document.getElementById('courseDialog').close()
      render(); toast('Course deleted')
    }
  })
  document.getElementById('saveCourse')?.addEventListener('click', (e)=>{
    e.preventDefault()
    const id=document.getElementById('courseId').value
    const code=document.getElementById('courseCode').value.trim()
    const name=document.getElementById('courseName').value.trim()
    if(!code || !name) return alert('Code and name required')
    const topics=document.getElementById('courseTopics').value.split(',').map(s=>s.trim()).filter(Boolean)
    const weakAreas=document.getElementById('courseWeak').value.split(',').map(s=>s.trim()).filter(Boolean)
    const rawDeadlines=document.getElementById('courseDeadlines').value.trim()
    let deadlines=[]
    if(rawDeadlines){
      deadlines = rawDeadlines.split(',').map(s=>s.trim()).filter(Boolean).map(entry=>{
        const parts=entry.split(':')
        if(parts.length===2) return { title: parts[0].trim(), date: parts[1].trim() }
        return { title: entry, date: new Date().toISOString().slice(0,10) }
      })
    }
    const priority=parseInt(document.getElementById('coursePriority').value)||3
    const d=store.get()
    if(id){
      const idx=d.courses.findIndex(c=>c.id===id)
      if(idx!==-1) d.courses[idx]={ ...d.courses[idx], code, name, topics, weakAreas, deadlines, priority }
    } else {
      d.courses.unshift({ id: uid(), code, name, topics, weakAreas, deadlines, priority, sessions:[] })
    }
    store.set({ courses: d.courses })
    document.getElementById('courseDialog').close()
    render(); toast('Course saved ✓')
  })
  // course dialog helper
  // log session now creates real state transition: adds to sessions, updates course weakAreas if studied
  document.getElementById('logSessionBtn')?.addEventListener('click', ()=>{
    const d=store.get()
    if(!d.courses.length) return alert('Add a course first')
    // simple prompt for mins but with validation — keep lightweight
    const code=prompt(`Course code? (${d.courses.map(c=>c.code).join(', ')})`)||d.courses[0].code
    const minsStr=prompt('Minutes studied?','60')
    const mins=parseInt(minsStr||'0')
    if(!mins || mins<=0) return alert('Enter valid minutes')
    const weak=prompt('Weak area studied? (optional)')||''
    const course = d.courses.find(c=>c.code===code)
    d.sessions.unshift({ id:uid(), type:'study', courseCode:code, mins, date: new Date().toISOString(), weakArea: weak })
    // real transition: if weak area studied, consider reducing its weight after 3 sessions on same weak area
    if(course && weak){
      const count = d.sessions.filter(s=>s.courseCode===code && s.weakArea===weak).length
      if(count>=3){
        // after 3 sessions, suggest removing from weakAreas (user still confirms via toast)
        // we do not auto-remove to preserve user control, but we note progress
        toast(`Logged ${mins}m for ${code} — ${weak} studied ${count}x. Consider removing from weak areas if confident.`)
      } else {
        toast(`Session logged — ${mins}m`)
      }
    } else {
      toast('Session logged')
    }
    store.set({ sessions: d.sessions })
    render()
  })
  document.querySelectorAll('[data-study]').forEach(b=>{
    b.addEventListener('click', ()=>{
      const c=store.get().courses.find(x=>x.id===b.dataset.study)
      const next=`Study ${c.code}: ${c.weakAreas[0] || c.topics[0] || 'review notes'} — 90 min deep work, no phone`
      if(confirm(`Set next action for study project?\n${next}\n\nCreate/ensure project exists?`)){
        // use stable linkedProjectId if present, else create
        let existing = null
        if(c.linkedProjectId) existing = store.get().projects.find(p=>p.id===c.linkedProjectId)
        if(!existing) existing = store.get().projects.find(p=>p.linkedCourseId===c.id)
        if(existing) store.updateProject(existing.id, { nextAction: next })
        else {
          try{
            const proj = store.addProject({ name:`Study — ${c.code} ${c.name}`, area:'academics', objective:`Master ${c.name}`, strategicImportance:5, effort:'M', nextAction: next, linkedCourseId: c.id })
            c.linkedProjectId = proj.id
            store.set({ courses: store.get().courses })
          }catch(e){ alert(e.message) }
        }
        go('projects')
      }
    })
  })

  // Business
  document.getElementById('addOppBtn')?.addEventListener('click', ()=> openOppDialog())
  document.querySelectorAll('[data-editopp]').forEach(b=> b.addEventListener('click', ()=> openOppDialog(b.dataset.editopp)))
  document.getElementById('deleteOpp')?.addEventListener('click', ()=>{
    const id=document.getElementById('oppId').value
    if(id && confirm('Delete opportunity?')){
      const d=store.get()
      d.opportunities = d.opportunities.filter(o=>o.id!==id)
      store.set({ opportunities: d.opportunities })
      document.getElementById('oppDialog').close()
      render(); toast('Deleted')
    }
  })
  // update validation score live
  ;['oppAssumptions','oppEvidence'].forEach(id=>{
    document.getElementById(id)?.addEventListener('input', updateOppScore)
  })
  document.getElementById('saveOpp')?.addEventListener('click', (e)=>{
    e.preventDefault()
    const id=document.getElementById('oppId').value
    const title=document.getElementById('oppTitle').value.trim()
    if(!title) return alert('Title required')
    const stage=document.getElementById('oppStage').value
    const revenue=parseInt(document.getElementById('oppRevenue').value)||0
    const assumptions=document.getElementById('oppAssumptions').value.split(',').map(s=>s.trim()).filter(Boolean)
    const evidence=document.getElementById('oppEvidence').value.split(',').map(s=>s.trim()).filter(Boolean)
    // lightweight validation: revenue requires evidence
    if(stage==='revenue' && evidence.length===0) return alert('Revenue stage requires at least one evidence item')
    const d=store.get()
    if(id){
      const idx=d.opportunities.findIndex(o=>o.id===id)
      if(idx!==-1) d.opportunities[idx]={ ...d.opportunities[idx], title, stage, revenue, assumptions, evidence }
    } else {
      d.opportunities.unshift({ id:uid(), title, stage, assumptions, evidence, revenue, prospects:[] })
    }
    store.set({ opportunities: d.opportunities })
    document.getElementById('oppDialog').close()
    render(); toast('Opportunity saved ✓')
  })
  document.querySelectorAll('[data-oppnext]').forEach(b=>{
    b.addEventListener('click', ()=>{
      const opp=store.get().opportunities.find(o=>o.id===b.dataset.oppnext)
      const next=prompt(`Next validation for "${opp.title}" — what evidence will you collect?`, 'Interview 5 users with 3 questions')
      if(!next) return
      const proj=store.get().projects.find(p=>p.name===opp.title)
      if(proj) store.updateProject(proj.id, { nextAction: next })
      else {
        try{ store.addProject({ name: opp.title, objective:`Validate ${opp.title}`, area:'business', strategicImportance:4, effort:'S', nextAction: next })}catch(e){ alert(e.message) }
      }
      go('projects')
    })
  })

  // Quick Capture (bound each render for static buttons as well)
  ;(() => {
    const bindCapture = () => {
      const openCaptureInner = (type='project') => {
        const dlg=document.getElementById('captureDialog')
        if(!dlg) return
        const sel=document.getElementById('capMemProject')
        if(sel) sel.innerHTML='<option value="">No linked project</option>'+store.get().projects.map(p=>`<option value="${p.id}">${escapeHTML(p.name)}</option>`).join('')
        document.querySelectorAll('.capture-tab').forEach(b=>{
          const isActive=b.dataset.captureTab===type
          b.className=isActive?'capture-tab flex-1 h-9 rounded-xl bg-white text-black text-sm font-medium':'capture-tab flex-1 h-9 rounded-xl bg-tao-card border border-tao-border text-sm'
        })
        document.querySelectorAll('.capture-pane').forEach(p=>p.classList.add('hidden'))
        const pane=document.getElementById('capture'+type.charAt(0).toUpperCase()+type.slice(1)+'Pane')
        if(pane) pane.classList.remove('hidden')
        ;['capProjectName','capProjectObjective','capNextAction','capIdeaTitle','capIdeaDesc','capMemTitle','capMemContent','capMemTags','capDecTitle','capDecContext','capDecAssumptions'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value='' })
        dlg.showModal()
  try{ const first=dlg.querySelector('input, textarea, select, button'); if(first) setTimeout(()=> first.focus(), 50); dlg.setAttribute('aria-modal','true'); if(!dlg.getAttribute('aria-label')) dlg.setAttribute('aria-label', dlg.querySelector('h3')?.textContent||'Dialog') }catch{}
        dlg.dataset.activeTab=type
      }
      window.openCapture = openCaptureInner
      document.getElementById('captureBtn')?.addEventListener('click', ()=> openCaptureInner('project'))
      document.getElementById('topCaptureBtn')?.addEventListener('click', ()=> openCaptureInner('project'))
      document.getElementById('mobileCapture')?.addEventListener('click', ()=> openCaptureInner('project'))
      document.querySelectorAll('.capture-tab').forEach(b=> b.addEventListener('click', ()=> openCaptureInner(b.dataset.captureTab)))
      document.getElementById('captureSave')?.addEventListener('click', (e)=>{
        e.preventDefault()
        const dlg=document.getElementById('captureDialog')
        const type=dlg.dataset.activeTab||'project'
        try{
          if(type==='project'){
            const name=document.getElementById('capProjectName').value.trim()
            const objective=document.getElementById('capProjectObjective').value.trim()
            const nextAction=document.getElementById('capNextAction').value.trim()
            const area=document.getElementById('capArea').value
            const effort=document.getElementById('capEffort').value
            if(!name) return alert('Name required')
            if(!nextAction) return alert('Next action required for active project')
            store.addProject({ name, objective, area, effort, strategicImportance:3, nextAction })
            toast('Project captured ✓')
          } else if(type==='idea'){
            const title=document.getElementById('capIdeaTitle').value.trim()
            const desc=document.getElementById('capIdeaDesc').value.trim()
            if(!title) return alert('Title required')
            store.addIdea({ title, description:desc })
            toast('Idea captured ✓')
          } else if(type==='memory'){
            const title=document.getElementById('capMemTitle').value.trim()
            const content=document.getElementById('capMemContent').value.trim()
            const memType=document.getElementById('capMemType').value
            const linkedProject=document.getElementById('capMemProject').value||null
            const tags=document.getElementById('capMemTags')?.value.split(',').map(s=>s.trim()).filter(Boolean)||[]
            if(!content) return alert('Content required')
            store.addMemory({ title, content, type:memType, linkedProject, tags })
            toast('Memory saved ✓')
          } else if(type==='decision'){
            const title=document.getElementById('capDecTitle').value.trim()
            const context=document.getElementById('capDecContext').value.trim()
            const assumptions=document.getElementById('capDecAssumptions').value.split(',').map(s=>s.trim()).filter(Boolean)
            const confidence=parseInt(document.getElementById('capDecConfidence').value)||60
            const reviewDate=document.getElementById('capDecReview').value||null
            if(!title) return alert('Title required')
            store.addDecision({ title, context, assumptions, confidence, reviewDate, expectedOutcome:'' })
            toast('Decision logged ✓')
          }
          dlg.close()
          render()
        }catch(err){ alert(err.message) }
      })
    }
    // bind immediately and on each render, ensure idempotent
    if(!window._captureBound){
      window._captureBound=true
      bindCapture()
      // also rebind on each render via store subscribe? For now, call on each render by wrapping render
      const origRender = window.render
      // Instead, we will call bindCapture inside bind, so we add it there as well
    }
    // Also ensure data-open-capture buttons inside content
    document.querySelectorAll('[data-open-capture]').forEach(b=> b.addEventListener('click', ()=> { const dlg=document.getElementById('captureDialog'); if(dlg) dlg.showModal() }))
  })();

}

function openProjDialog(id=null){
  const dlg=document.getElementById('projDialog')
  const isEdit=!!id
  if(isEdit){
    const p=store.get().projects.find(x=>x.id===id)
    if(!p) return
    document.getElementById('projId').value=p.id
    document.getElementById('projName').value=p.name
    document.getElementById('projObj').value=p.objective
    document.getElementById('projArea').value=p.area
    document.getElementById('projEffort').value=p.effort
    document.getElementById('projImp').value=p.strategicImportance
    document.getElementById('projDeadline').value=p.deadline||''
    document.getElementById('projStatus').value=p.status
    document.getElementById('projNext').value=p.nextAction||''
    document.getElementById('projBlockers').value=(p.blockers||[]).join(', ')
    document.getElementById('projMilestones').value=(p.milestones||[]).join(', ')
    document.getElementById('projDeps').value=(p.dependencies||[]).join(', ')
    document.getElementById('deleteProj').classList.remove('hidden')
  } else {
    document.getElementById('projId').value=''
    document.getElementById('projName').value=''
    document.getElementById('projObj').value=''
    document.getElementById('projArea').value='technology'
    document.getElementById('projEffort').value='M'
    document.getElementById('projImp').value='3'
    document.getElementById('projDeadline').value=''
    document.getElementById('projStatus').value='active'
    document.getElementById('projNext').value=''
    document.getElementById('projBlockers').value=''
    document.getElementById('projMilestones').value=''
    document.getElementById('projDeps').value=''
    document.getElementById('deleteProj').classList.add('hidden')
  }
  dlg.showModal()
  try{ const first=dlg.querySelector('input, textarea, select, button'); if(first) setTimeout(()=> first.focus(), 50); dlg.setAttribute('aria-modal','true'); if(!dlg.getAttribute('aria-label')) dlg.setAttribute('aria-label', dlg.querySelector('h3')?.textContent||'Dialog') }catch{}
}

function openCourseDialog(id=null){
  const dlg=document.getElementById('courseDialog')
  const isEdit=!!id
  if(isEdit){
    const c=store.get().courses.find(x=>x.id===id)
    if(!c) return
    document.getElementById('courseId').value=c.id
    document.getElementById('courseCode').value=c.code
    document.getElementById('courseName').value=c.name
    document.getElementById('courseTopics').value=(c.topics||[]).join(', ')
    document.getElementById('courseWeak').value=(c.weakAreas||[]).join(', ')
    document.getElementById('courseDeadlines').value=(c.deadlines||[]).map(d=>`${d.title}: ${d.date}`).join(', ')
    document.getElementById('coursePriority').value=c.priority
    document.getElementById('deleteCourse').classList.remove('hidden')
  } else {
    document.getElementById('courseId').value=''
    document.getElementById('courseCode').value=''
    document.getElementById('courseName').value=''
    document.getElementById('courseTopics').value=''
    document.getElementById('courseWeak').value=''
    document.getElementById('courseDeadlines').value=''
    document.getElementById('coursePriority').value='3'
    document.getElementById('deleteCourse').classList.add('hidden')
  }
  dlg.showModal()
  try{ const first=dlg.querySelector('input, textarea, select, button'); if(first) setTimeout(()=> first.focus(), 50); dlg.setAttribute('aria-modal','true'); if(!dlg.getAttribute('aria-label')) dlg.setAttribute('aria-label', dlg.querySelector('h3')?.textContent||'Dialog') }catch{}
}
function openOppDialog(id=null){
  const dlg=document.getElementById('oppDialog')
  const isEdit=!!id
  if(isEdit){
    const o=store.get().opportunities.find(x=>x.id===id)
    if(!o) return
    document.getElementById('oppId').value=o.id
    document.getElementById('oppTitle').value=o.title
    document.getElementById('oppStage').value=o.stage
    document.getElementById('oppRevenue').value=o.revenue
    document.getElementById('oppAssumptions').value=(o.assumptions||[]).join(', ')
    document.getElementById('oppEvidence').value=(o.evidence||[]).join(', ')
    document.getElementById('deleteOpp').classList.remove('hidden')
  } else {
    document.getElementById('oppId').value=''
    document.getElementById('oppTitle').value=''
    document.getElementById('oppStage').value='idea'
    document.getElementById('oppRevenue').value=''
    document.getElementById('oppAssumptions').value=''
    document.getElementById('oppEvidence').value=''
    document.getElementById('deleteOpp').classList.add('hidden')
  }
  updateOppScore()
  dlg.showModal()
  try{ const first=dlg.querySelector('input, textarea, select, button'); if(first) setTimeout(()=> first.focus(), 50); dlg.setAttribute('aria-modal','true'); if(!dlg.getAttribute('aria-label')) dlg.setAttribute('aria-label', dlg.querySelector('h3')?.textContent||'Dialog') }catch{}
}
function updateOppScore(){
  const a=document.getElementById('oppAssumptions')?.value.split(',').map(s=>s.trim()).filter(Boolean).length||0
  const e=document.getElementById('oppEvidence')?.value.split(',').map(s=>s.trim()).filter(Boolean).length||0
  const scoreEl=document.getElementById('oppScore')
  if(scoreEl){
    const score = a===0 ? (e>0? '∞' : '0') : (e/a).toFixed(2)
    const pct = a===0 ? 0 : Math.min(100, Math.round((e/Math.max(1,a))*100))
    scoreEl.textContent = `${score} (${pct}%)`
    scoreEl.className = pct>=100 ? 'font-bold text-emerald-600' : pct>=50 ? 'font-bold text-amber-600' : 'font-bold text-red-600'
  }
}

function toast(msg){
  const t=document.createElement('div')
  t.textContent=msg
  t.className='fixed bottom-8 left-1/2 -translate-x-1/2 bg-white text-black text-sm px-4 py-2 rounded-full shadow-lg z-50'
  document.body.appendChild(t)
  setTimeout(()=> t.remove(), 2200)
}

// --- Command Palette & AI ---
function buildPalette(filter=''){
  const d=store.get()
  const f=filter.toLowerCase()
  const items=[
    ...d.projects.map(p=>({ label:`Project: ${p.name}`, desc: p.nextAction, action:()=> go('projects'), score: p.name.toLowerCase().includes(f)? 10:0 })),
    ...d.ideas.map(i=>({ label:`Idea: ${i.title}`, desc: `${i.total}/20`, action:()=> go('ideas'), score: i.title.toLowerCase().includes(f)? 10:0 })),
    ...d.decisions.map(dec=>({ label:`Decision: ${dec.title}`, desc: dec.status, action:()=> go('decisions'), score: dec.title.toLowerCase().includes(f)? 10:0 })),
    ...d.memories.map(m=>({ label:`Memory: ${m.title||m.content.slice(0,30)}`, desc: m.type, action:()=> go('memory'), score: (m.title+' '+m.content).toLowerCase().includes(f)? 10:0 })),
    ...d.courses.map(c=>({ label:`Course: ${c.code} ${c.name}`, desc: c.topics.join(', '), action:()=> go('study'), score: (c.code+' '+c.name).toLowerCase().includes(f)? 10:0 })),
    ...d.opportunities.map(o=>({ label:`Opportunity: ${o.title}`, desc: o.stage, action:()=> go('business'), score: o.title.toLowerCase().includes(f)? 10:0 })),
    { label:'Ask TAO — operational guidance', desc:'Use local memory + AI provider', action:()=> askTAO(filter), score: f? 5:0 },
    { label:'New project', desc:'Create with next action enforcement', action:()=> openProjDialog(), score: 'new project'.includes(f)? 10:0 },
    { label:'Go to Command Center', desc:'G then C', action:()=> go('command'), score0:0 },
    { label:'Go to Planning Engine', desc:'Ranked next actions', action:()=> go('planning'), score0:0 },
  ]
  let filtered = f ? items.filter(i=> i.label.toLowerCase().includes(f) || i.desc.toLowerCase().includes(f) || i.score>0) : items.slice(0,8)
  if(filtered.length===0) filtered=[{ label:`Ask TAO: "${filter}"`, desc:'Press Enter to generate', action:()=> askTAO(filter) }]
  return filtered.slice(0,8)
}

function showPalette(){
  const pal=document.getElementById('palette')
  pal.classList.remove('hidden'); pal.classList.add('grid')
  const inp=document.getElementById('paletteInput')
  inp.value=''; inp.focus()
  paletteIdx=0
  renderPalette('')
}

function renderPalette(q){
  const res=document.getElementById('paletteResults')
  const items=buildPalette(q)
  res.innerHTML=items.map((it,i)=>`
    <button data-pidx="${i}" class="w-full text-left px-3 py-2.5 rounded-xl flex gap-3 items-center ${i===paletteIdx?'bg-tao-card border border-tao-border':'hover:bg-tao-card/60 border border-transparent'}">
      <span class="w-8 h-8 grid place-items-center rounded-lg bg-tao-card border border-tao-border text-xs">${i===0?'⚡':'→'}</span>
      <span class="flex-1"><div class="text-sm font-medium">${it.label}</div><div class="text-xs text-tao-muted">${it.desc||''}</div></span>
      <span class="kbd">↵</span>
    </button>
  `).join('')
  // cache for enter
  res._items=items
}

async function askTAO(prompt){
  const provider=document.getElementById('aiProvider').value
  const key=document.getElementById('aiKey').value.trim()
  const context={
    projects: store.get().projects.slice(0,12),
    decisions: store.get().decisions.slice(0,6),
    ideas: store.get().ideas.slice(0,6),
    daily: store.get().daily[todayISO()] || null,
    weekly: weeklyAnalysis(store.get()).totals
  }
  // show in palette area
  const res=document.getElementById('paletteResults')
  res.innerHTML=`<div class="p-6 text-sm text-tao-muted">TAO thinking with <b>${provider}</b> — local memory injected, no cloud unless you configured a key…</div>`
  try{
    const out=await generateWithProvider(provider, key, prompt || 'Given my current state, what should I do next? Be concrete.', context)
    res.innerHTML=`<div class="p-4 text-sm leading-relaxed whitespace-pre-wrap">${escapeHTML(out)}</div>`
  }catch(e){
    res.innerHTML=`<div class="p-4 text-sm text-red-300">${escapeHTML(e.message)}</div>`
  }
}

function escapeHTML(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }

// --- Events ---
document.getElementById('mobileMenu').addEventListener('click', ()=> document.getElementById('sidebar').classList.toggle('hidden'))
document.getElementById('commandBtn').addEventListener('click', ()=> showPalette())
document.getElementById('globalSearch').addEventListener('input', ()=> render())
document.getElementById('globalSearch').addEventListener('focus', ()=> showPalette())
document.getElementById('paletteInput').addEventListener('input', (e)=> renderPalette(e.target.value))
document.getElementById('palette').addEventListener('click', (e)=>{ if(e.target.id==='palette') hidePalette() })
document.getElementById('paletteResults').addEventListener('click', (e)=>{
  const btn=e.target.closest('[data-pidx]')
  if(!btn) return
  const items=document.getElementById('paletteResults')._items
  const it=items[parseInt(btn.dataset.pidx)]
  if(it){ hidePalette(); it.action() }
})
function hidePalette(){ const p=document.getElementById('palette'); p.classList.add('hidden'); p.classList.remove('grid') }

document.getElementById('aiProvider').addEventListener('change', (e)=>{
  store.set({ settings: { ...store.get().settings, aiProvider: e.target.value } })
})
document.getElementById('aiKey').addEventListener('change', (e)=>{
  store.set({ settings: { ...store.get().settings, aiKey: e.target.value } })
})
// init selects from store
document.getElementById('aiProvider').value = store.get().settings.aiProvider || 'mock'
document.getElementById('aiKey').value = store.get().settings.aiKey || ''

document.getElementById('exportBtn').addEventListener('click', ()=>{
  const blob=new Blob([store.exportJSON()], {type:'application/json'})
  const url=URL.createObjectURL(blob)
  const a=document.createElement('a'); a.href=url; a.download=`tao-backup-${todayISO()}.json`; a.click(); URL.revokeObjectURL(url)
})
document.getElementById('importFile').addEventListener('change', async(e)=>{
  const f=e.target.files[0]; if(!f) return
  const text=await f.text()
  try{ store.importJSON(text); toast('Imported ✓'); render() }catch(err){ alert('Invalid JSON: '+err.message) }
})

// Keyboard
document.addEventListener('keydown', (e)=>{
  const tag=document.activeElement?.tagName
  const isInput= tag==='INPUT' || tag==='TEXTAREA' || tag==='SELECT'
  if(e.key==='?' && !isInput){ e.preventDefault(); const h=document.getElementById('help'); h.classList.toggle('hidden'); h.classList.toggle('grid') }
  if((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==='k'){ e.preventDefault(); showPalette() }
  if(e.key==='/' && !isInput){ e.preventDefault(); document.getElementById('globalSearch').focus() }
  if(e.key==='Escape'){ hidePalette(); document.getElementById('help').classList.add('hidden'); document.getElementById('help').classList.remove('grid') }
  if(e.key==='n' && !isInput){ e.preventDefault(); openProjDialog() }
  if(e.key==='a' && !isInput){ e.preventDefault(); showPalette(); setTimeout(()=> document.getElementById('paletteInput').focus(), 0) }
  if(e.key==='e' && !isInput){ document.getElementById('exportBtn').click() }

  // palette nav
  if(!document.getElementById('palette').classList.contains('hidden')){
    if(e.key==='ArrowDown'){ e.preventDefault(); paletteIdx=Math.min(7, paletteIdx+1); renderPalette(document.getElementById('paletteInput').value) }
    if(e.key==='ArrowUp'){ e.preventDefault(); paletteIdx=Math.max(0, paletteIdx-1); renderPalette(document.getElementById('paletteInput').value) }
    if(e.key==='Enter'){
      const items=document.getElementById('paletteResults')._items
      const it=items?.[paletteIdx]
      if(it){ hidePalette(); it.action() }
    }
  }
  // G sequence: reliable 800ms buffer, handles rapid keys
  if(!window._gBuffer) window._gBuffer={ active:false, timer:null }
  if(e.key.toLowerCase()==='g' && !isInput && !e.ctrlKey && !e.metaKey){
    e.preventDefault()
    window._gBuffer.active=true
    clearTimeout(window._gBuffer.timer)
    window._gBuffer.timer=setTimeout(()=>{ window._gBuffer.active=false }, 800)
    return
  }
  if(window._gBuffer.active && !isInput){
    const k=e.key.toLowerCase()
    const map={ t:'command', c:'command', f:'focus', p:'projects', e:'planning', m:'memory', d:'decisions', i:'ideas', s:'study', b:'business', v:'dev', w:'weekly', ',':'settings' }
    if(map[k]){
      e.preventDefault()
      go(map[k])
      window._gBuffer.active=false
      clearTimeout(window._gBuffer.timer)
      return
    }
    // if not a valid second key, clear buffer
    window._gBuffer.active=false
    clearTimeout(window._gBuffer.timer)
  }
})

// clock
setInterval(()=>{ const el=document.getElementById('clock'); if(el) el.textContent=new Date().toLocaleTimeString('en-NG',{hour:'2-digit',minute:'2-digit'}) }, 1000)
function updateBadges(){
  const data=store.get()
  const bad=document.getElementById('enforcementBadge')
  if(bad){
    const active=data.projects.filter(p=>p.status==='active')
    const missing=active.filter(p=>!p.nextAction?.trim())
    bad.textContent=''
    const span=document.createElement('span')
    if(missing.length>0){
      span.className='text-tao-danger'
      span.textContent=`${missing.length} active project(s) missing next action — fix now`
    } else {
      span.className='text-emerald-400'
      span.textContent=`✓ ${active.length} active — all have next actions`
    }
    bad.appendChild(span)
  }
  const sp=document.getElementById('statusProjects')
  const si=document.getElementById('statusIdeas')
  const ss=document.getElementById('storeSize')
  if(sp) sp.textContent=`${data.projects.length} projects`
  if(si) si.textContent=`${data.ideas.length} ideas`
  if(ss){ try{ ss.textContent=`${(new Blob([JSON.stringify(data)]).size/1024).toFixed(1)} KB` }catch{} }
}
store.subscribe(updateBadges)
setTimeout(updateBadges, 0)
window.addEventListener('tao:persist-error', (e)=>{
  const msg=e.detail||'Storage failed'
  const el=document.getElementById('persistError')
  if(el) return
  const div=document.createElement('div')
  div.id='persistError'
  div.textContent=msg
  div.style.cssText='position:fixed;top:12px;left:50%;transform:translateX(-50%);background:#FF4A4A;color:white;padding:10px 16px;border-radius:10px;font-size:13px;z-index:9999;max-width:90vw'
  document.body.appendChild(div)
  setTimeout(()=>div.remove(),6000)
})

// respect reduced-motion
try{
  if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches){
    document.documentElement.style.setProperty('--tao-motion','0s')
    const style=document.createElement('style')
    style.textContent='*{animation-duration:0.01ms !important;transition-duration:0.01ms !important}'
    document.head.appendChild(style)
  }
}catch{}
// restore focus interval on load if active
if(focusState.active && !focusState.paused){
  focusState.startedAt = Date.now() - focusState.elapsed*1000
  focusInterval = setInterval(()=>{ focusState.elapsed = Math.floor((Date.now()-focusState.startedAt)/1000); persistFocus(); const el=document.getElementById('focusTimerDisplay'); if(el) el.textContent=formatMins(Math.max(0, focusState.totalMins*60 - focusState.elapsed)); const bar=document.getElementById('focusProgress'); if(bar) bar.style.width=`${Math.min(100, (focusState.elapsed/(focusState.totalMins*60))*100)}%`; if(focusState.elapsed>=focusState.totalMins*60){ finishFocus('completed') } }, 1000)
}
// init
renderNav()
render()
