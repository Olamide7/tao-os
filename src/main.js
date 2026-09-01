import { store, uid, todayISO, calcIdeaScore } from './lib/store.js'
import { recommend, weeklyAnalysis, scoreProject } from './lib/planning.js'
import { generateWithProvider } from './lib/ai.js'
import { mockDevSnapshot, pickRepoDirectory, scanDirectory } from './lib/devmode.js'

// --- Router & State ---
const routes = [
  { id:'command', label:'Command Center', icon:'◉', k:'C', group:'Operate' },
  { id:'projects', label:'Projects', icon:'◆', k:'P', group:'Operate' },
  { id:'planning', label:'Planning Engine', icon:'⚡', k:'E', group:'Operate' },
  { id:'memory', label:'Memory', icon:'◑', k:'M', group:'Memory' },
  { id:'decisions', label:'Decision Journal', icon:'✦', k:'D', group:'Memory' },
  { id:'ideas', label:'Idea Vault', icon:'💡', k:'I', group:'Memory' },
  { id:'weekly', label:'Weekly Intelligence', icon:'▣', k:'W', group:'Review' },
  { id:'dev', label:'Developer Mode', icon:'</>', k:'V', group:'Modes' },
  { id:'study', label:'Study Mode', icon:'🎓', k:'S', group:'Modes' },
  { id:'business', label:'Business Mode', icon:'₦', k:'B', group:'Modes' },
]

let current = localStorage.getItem('tao.route') || 'command'
let paletteIdx = 0
let devSnapshot = mockDevSnapshot()

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
  current=id
  localStorage.setItem('tao.route', id)
  renderNav()
  render()
  if(window.innerWidth<768) document.getElementById('sidebar').classList.add('hidden')
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
  const daily = d.daily[today] || { priorities:[], blockers:[], nextActions:[], timeBlocks:[], reflection:'' }
  const recs = recommend(d, 180).slice(0,3)
  const overdue = d.projects.filter(p=> p.deadline && new Date(p.deadline) < new Date() && p.status==='active').length
  const active = d.projects.filter(p=>p.status==='active').length
  return `
  <div class="p-4 md:p-6 max-w-[1200px] mx-auto space-y-6">
    <!-- Hero -->
    <div class="rounded-[24px] bg-gradient-to-br from-tao-card via-tao-surface to-tao-card border border-tao-border p-6 md:p-8">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div class="text-xs tracking-[0.18em] text-tao-muted uppercase">Command Center • ${new Date().toLocaleDateString('en-NG',{weekday:'long', month:'long', day:'numeric'})}</div>
          <h1 class="text-3xl md:text-[40px] font-semibold tracking-tight mt-2 leading-none">What deserves<br/>your attention <span class="text-tao-accent">today?</span></h1>
          <p class="text-sm text-tao-muted mt-3 max-w-xl">TAO shows next physical actions, blockers and time allocation — not a todo dump. One decision: what will you do next?</p>
        </div>
        <div class="flex gap-3">
          <div class="rounded-2xl bg-tao-accent text-black px-5 py-4 min-w-[120px]">
            <div class="text-xs font-mono uppercase tracking-widest">Active</div><div class="text-3xl font-bold">${active}</div><div class="text-xs">projects</div>
          </div>
          <div class="rounded-2xl bg-tao-card border border-tao-border px-5 py-4 min-w-[120px]">
            <div class="text-xs font-mono uppercase tracking-widest text-tao-muted">Overdue</div><div class="text-3xl font-bold ${overdue?'text-tao-danger':''}">${overdue}</div><div class="text-xs text-tao-muted">needs action</div>
          </div>
        </div>
      </div>

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
                <input data-prio="${i}" value="${(daily.priorities[i]||'').replace(/"/g,'&quot;')}" placeholder="${i===0?'e.g., Ship TAO Planning Engine scoring': i===1?'e.g., Solve 3 DP problems':'e.g., Send client Loom video'}" class="flex-1 h-9 rounded-xl bg-tao-card border border-tao-border px-3 text-sm outline-none" />
              </div>
            `).join('')}
          </div>
          <div class="grid sm:grid-cols-2 gap-3 mt-4">
            <div>
              <div class="text-xs text-tao-muted mb-1">Blockers today</div>
              <textarea id="dailyBlockers" rows="2" placeholder="NEPA, data, waiting on client…" class="w-full rounded-xl bg-tao-card border border-tao-border p-3 text-sm outline-none">${daily.blockers?.join('\n')||''}</textarea>
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
          </div>
        </div>

        <div class="rounded-2xl bg-tao-accent text-black p-4">
          <div class="text-xs font-mono uppercase tracking-widest">TAO Recommends — Next 3h</div>
          <div class="mt-3 space-y-3">
            ${recs.length? recs.map(({p,score},i)=>`
              <div class="rounded-xl bg-black text-white p-3">
                <div class="flex items-center gap-2 text-xs"><span class="w-6 h-6 grid place-items-center rounded-full bg-white text-black font-bold">${i+1}</span><span class="font-mono">${score}/100</span><span class="ml-auto">${effortBadge(p.effort)}</span></div>
                <div class="font-medium mt-2 leading-tight">${p.name}</div>
                <div class="text-xs text-zinc-400 mt-1">Next: <span class="text-white">${p.nextAction}</span></div>
                <div class="text-[11px] text-zinc-500 mt-1">${p.deadline? `Due ${fmtDate(p.deadline)} (${daysLeft(p.deadline)}d)` : 'No deadline'} • ${p.area}</div>
              </div>
            `).join('') : '<div class="text-sm">No active projects. Create one — but with a next action.</div>'}
          </div>
          <button onclick="document.querySelector('[data-route=planning]').click()" class="mt-3 w-full h-9 rounded-xl bg-black text-white text-sm font-medium">Open Planning Engine →</button>
        </div>
      </div>
    </div>

    <!-- Next Actions list -->
    <div class="rounded-2xl bg-tao-surface border border-tao-border overflow-hidden">
      <div class="px-4 h-12 flex items-center justify-between border-b border-tao-border">
        <h3 class="font-semibold">All Next Physical Actions — do these, nothing else</h3>
        <span class="text-xs text-tao-muted">${d.projects.filter(p=>p.status==='active').length} actions</span>
      </div>
      <div class="divide-y divide-tao-border">
        ${d.projects.filter(p=>p.status==='active').sort((a,b)=> scoreProject(b,180)-scoreProject(a,180)).map(p=>`
          <div class="px-4 py-3 flex gap-3 items-center hover:bg-tao-card/60">
            <input type="checkbox" data-done="${p.id}" class="w-5 h-5 rounded accent-tao-accent" />
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium truncate">${p.nextAction}</div>
              <div class="text-xs text-tao-muted truncate">${p.name} • ${p.area} • ${p.deadline? fmtDate(p.deadline): 'no deadline'}</div>
            </div>
            <span class="hidden sm:inline text-xs font-mono">${scoreProject(p,180)}/100</span>
            <button data-focus="${p.id}" class="text-xs px-3 py-1.5 rounded-full bg-tao-card border border-tao-border">Focus</button>
          </div>
        `).join('') || '<div class="p-8 text-center text-tao-muted text-sm">No next actions — your system is clear. Capture or promote? </div>'}
      </div>
    </div>
  </div>
  `
}

function viewProjects(){
  const d=store.get()
  const q = (document.getElementById('globalSearch')?.value || '').toLowerCase()
  let list = d.projects
  if(q) list = list.filter(p=> (p.name+p.objective+p.nextAction).toLowerCase().includes(q))
  return `
  <div class="p-4 md:p-6 max-w-[1200px] mx-auto space-y-4">
    <div class="flex flex-wrap items-center gap-3">
      <h1 class="text-2xl font-semibold">Projects</h1>
      <span class="text-xs px-2 py-1 rounded-full bg-tao-card border border-tao-border">${list.length} total</span>
      <span class="hidden sm:inline text-xs text-tao-muted">Enforcement: active without nextAction is blocked by TAO</span>
      <button id="newProjectBtn" class="ml-auto h-9 px-4 rounded-xl bg-tao-accent text-black text-sm font-semibold">+ New project (N)</button>
    </div>

    <div class="flex gap-2 overflow-x-auto pb-1">
      ${['all','active','paused','done'].map(s=>`<button data-filter="${s}" class="px-3 py-1.5 rounded-full text-xs border ${s==='all'?'bg-white text-black border-white':'bg-tao-card border-tao-border text-tao-muted'}">${s}</button>`).join('')}
      <select id="sortProjects" class="ml-auto h-8 rounded-full bg-tao-card border border-tao-border px-3 text-xs">
        <option value="score">Sort: TAO score</option>
        <option value="deadline">Sort: deadline</option>
        <option value="importance">Sort: importance</option>
      </select>
    </div>

    <div id="projectGrid" class="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
      ${list.map(p=>{
        const score = scoreProject(p, 120)
        const dl = daysLeft(p.deadline)
        return `
        <div data-proj="${p.id}" class="rounded-2xl bg-tao-surface border border-tao-border p-4 flex flex-col gap-3 hover:border-zinc-700 transition">
          <div class="flex items-start justify-between gap-2">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">${statusBadge(p.status)} ${effortBadge(p.effort)} <span class="text-[11px] text-tao-muted">${p.area}</span></div>
              <h3 class="font-semibold leading-tight mt-2 line-clamp-2">${p.name}</h3>
              <div class="text-xs text-tao-muted mt-1 line-clamp-2">${p.objective||'—'}</div>
            </div>
            <span class="shrink-0 w-10 h-10 grid place-items-center rounded-xl bg-tao-card border border-tao-border font-mono text-xs">${score}</span>
          </div>

          <div class="rounded-xl bg-tao-accent text-black p-3">
            <div class="text-[11px] font-mono uppercase tracking-widest">Next physical action</div>
            <div class="text-sm font-medium mt-1">${p.nextAction || '<span class=text-tao-danger>⚠ Missing — required for active</span>'}</div>
          </div>

          <div class="space-y-2 text-xs">
            <div class="flex justify-between"><span class="text-tao-muted">Deadline</span><span class="${dl!==null && dl<3 ? 'text-tao-danger font-medium':''}">${p.deadline? fmtDate(p.deadline)+' ('+(dl>=0? dl+'d left': Math.abs(dl)+'d overdue')+')':'—'}</span></div>
            <div class="flex justify-between"><span class="text-tao-muted">Progress</span><span>${p.progress||0}%</span></div>
            <div class="w-full h-1.5 rounded-full bg-tao-card overflow-hidden"><div class="h-full bg-tao-accent" style="width:${p.progress||0}%"></div></div>
            ${p.blockers?.length? `<div class="rounded-lg bg-red-500/10 border border-red-500/20 p-2 text-red-300">Blockers: ${p.blockers.join(', ')}</div>`:''}
            ${p.dependencies?.length? `<div class="text-tao-muted">Depends on: ${p.dependencies.join(', ')}</div>`:''}
          </div>

          <div class="flex gap-2 mt-auto pt-2">
            <button data-edit="${p.id}" class="flex-1 h-8 rounded-xl bg-tao-card border border-tao-border text-xs">Edit</button>
            <button data-advance="${p.id}" class="flex-1 h-8 rounded-xl bg-white text-black text-xs font-medium">Update next action</button>
          </div>
        </div>
        `
      }).join('')}
    </div>

    ${list.length===0? '<div class="text-center py-16 text-tao-muted">No projects match. Press N to create your first — with a next action.</div>':''}
  </div>

  <dialog id="projDialog" class="rounded-2xl p-0 border border-tao-border bg-tao-surface text-white w-[min(640px,95vw)] backdrop:bg-black/60">
    <form method="dialog" id="projForm" class="p-6 space-y-4">
      <h3 class="text-lg font-semibold">New / Edit Project</h3>
      <input type="hidden" id="projId" />
      <label class="block text-xs">Name<input id="projName" required placeholder="e.g., Final Year Project — TAO OS" class="mt-1 w-full h-9 rounded-xl bg-tao-card border border-tao-border px-3 text-sm outline-none" /></label>
      <label class="block text-xs">Objective<textarea id="projObj" rows="2" placeholder="One clear outcome…" class="mt-1 w-full rounded-xl bg-tao-card border border-tao-border p-3 text-sm"></textarea></label>
      <div class="grid grid-cols-2 gap-3">
        <label class="text-xs">Area<select id="projArea" class="mt-1 w-full h-9 rounded-xl bg-tao-card border border-tao-border px-3 text-sm"><option>technology</option><option>academics</option><option>business</option><option>personal</option></select></label>
        <label class="text-xs">Effort<select id="projEffort" class="mt-1 w-full h-9 rounded-xl bg-tao-card border border-tao-border px-3 text-sm"><option>S</option><option selected>M</option><option>L</option><option>XL</option></select></label>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <label class="text-xs">Importance (1-5)<input id="projImp" type="number" min="1" max="5" value="3" class="mt-1 w-full h-9 rounded-xl bg-tao-card border border-tao-border px-3 text-sm" /></label>
        <label class="text-xs">Deadline<input id="projDeadline" type="date" class="mt-1 w-full h-9 rounded-xl bg-tao-card border border-tao-border px-3 text-sm" /></label>
      </div>
      <label class="block text-xs">Status<select id="projStatus" class="mt-1 w-full h-9 rounded-xl bg-tao-card border border-tao-border px-3 text-sm"><option value="active">active</option><option value="paused">paused</option><option value="done">done</option></select></label>
      <label class="block text-xs">Next physical action — <span class="text-tao-accent">required if active</span><input id="projNext" placeholder="e.g., Open VS Code and write test for planning.js" class="mt-1 w-full h-9 rounded-xl bg-tao-card border border-tao-border px-3 text-sm outline-none" /></label>
      <label class="block text-xs">Blockers (comma separated)<input id="projBlockers" placeholder="NEPA, waiting on… " class="mt-1 w-full h-9 rounded-xl bg-tao-card border border-tao-border px-3 text-sm" /></label>
      <div class="flex gap-2 justify-between pt-2">
        <button type="button" id="deleteProj" class="h-9 px-4 rounded-xl border border-red-500/30 text-red-300 text-sm hidden">Delete</button>
        <div class="ml-auto flex gap-2">
          <button value="cancel" class="h-9 px-4 rounded-xl bg-tao-card border border-tao-border text-sm">Cancel</button>
          <button id="saveProj" value="default" class="h-9 px-5 rounded-xl bg-tao-accent text-black text-sm font-semibold">Save</button>
        </div>
      </div>
      <p class="text-[11px] text-tao-muted">TAO enforces: active projects without a next action will be rejected.</p>
    </form>
  </dialog>
  `
}

function viewMemory(){
  const d=store.get()
  const types=['all','project','decision','goal','preference','knowledge','person','business','academic','technology','idea']
  return `
  <div class="p-4 md:p-6 max-w-[1100px] mx-auto space-y-4">
    <div class="flex flex-wrap gap-3 items-center">
      <h1 class="text-2xl font-semibold">Memory</h1>
      <span class="text-xs text-tao-muted">Structured long-term memory — separated by type. Searchable, linked to projects.</span>
      <button id="addMemBtn" class="ml-auto h-9 px-4 rounded-xl bg-tao-accent text-black text-sm font-semibold">+ Remember</button>
    </div>
    <div class="flex gap-2 overflow-x-auto">
      ${types.map(t=>`<button data-memfilter="${t}" class="shrink-0 px-3 py-1.5 rounded-full text-xs border ${t==='all'?'bg-white text-black':'bg-tao-card border-tao-border text-tao-muted'}">${t}</button>`).join('')}
    </div>
    <div class="grid md:grid-cols-2 gap-3" id="memGrid">
      ${d.memories.map(m=>`
        <div class="rounded-2xl bg-tao-surface border border-tao-border p-4">
          <div class="flex items-center gap-2 text-xs"><span class="px-2 py-1 rounded-full bg-tao-card border border-tao-border">${m.type}</span><span class="text-tao-muted">${new Date(m.created).toLocaleDateString()}</span><span class="ml-auto text-tao-muted">${m.linkedProject? '↗ linked':''}</span></div>
          <div class="font-medium mt-2">${m.title|| m.content.slice(0,60)}</div>
          <div class="text-sm text-tao-muted mt-1">${m.content}</div>
          ${m.tags?.length? `<div class="flex gap-1 mt-2 flex-wrap">${m.tags.map(t=>`<span class="text-[11px] px-2 py-1 rounded-full bg-tao-card border border-tao-border">#${t}</span>`).join('')}</div>`:''}
        </div>
      `).join('') || '<div class="text-tao-muted text-sm p-8 text-center col-span-2">No memories yet. Add goals, preferences, people, lessons.</div>'}
    </div>
  </div>
  `
}

function viewDecisions(){
  const d=store.get()
  return `
  <div class="p-4 md:p-6 max-w-[1100px] mx-auto space-y-4">
    <div class="flex items-center gap-3">
      <h1 class="text-2xl font-semibold">Decision Journal</h1>
      <button id="addDecBtn" class="ml-auto h-9 px-4 rounded-xl bg-tao-accent text-black text-sm font-semibold">+ Log decision</button>
    </div>
    <p class="text-sm text-tao-muted">Record assumptions, evidence, expected outcome, confidence — and later, the actual outcome. Build calibration.</p>
    <div class="space-y-3">
      ${d.decisions.map(dec=>`
        <div class="rounded-2xl bg-tao-surface border border-tao-border p-4">
          <div class="flex flex-wrap gap-2 items-start justify-between">
            <h3 class="font-semibold flex-1">${dec.title}</h3>
            <span class="text-xs px-2 py-1 rounded-full border ${dec.status==='validated'?'bg-emerald-500 text-black': dec.status==='invalidated'?'bg-red-500 text-white':'bg-tao-card border-tao-border'}">${dec.status}</span>
            <span class="text-xs font-mono px-2 py-1 rounded-full bg-tao-card border border-tao-border">${dec.confidence}% confidence</span>
          </div>
          <div class="text-xs text-tao-muted mt-1">${new Date(dec.created).toLocaleDateString()} • ${dec.context||''}</div>
          <div class="grid md:grid-cols-3 gap-3 mt-3 text-xs">
            <div class="rounded-xl bg-tao-card border border-tao-border p-3"><div class="font-semibold">Assumptions</div><ul class="list-disc ml-4 mt-1 space-y-1">${(dec.assumptions||[]).map(a=>`<li>${a}</li>`).join('')||'<li class=text-tao-muted>—</li>'}</ul></div>
            <div class="rounded-xl bg-tao-card border border-tao-border p-3"><div class="font-semibold">Evidence</div><ul class="list-disc ml-4 mt-1 space-y-1">${(dec.evidence||[]).map(e=>`<li>${e}</li>`).join('')||'<li class=text-tao-muted>—</li>'}</ul></div>
            <div class="rounded-xl bg-tao-card border border-tao-border p-3"><div class="font-semibold">Expected outcome</div><div class="mt-1">${dec.expectedOutcome||'—'}</div><div class="mt-2"><span class="text-tao-muted">Actual:</span> ${dec.outcome || '<span class=text-tao-muted>pending</span>'}</div></div>
          </div>
          <div class="flex gap-2 mt-3">
            <button data-validate="${dec.id}" class="h-8 px-3 rounded-xl bg-emerald-500 text-black text-xs font-medium">Mark validated</button>
            <button data-invalidate="${dec.id}" class="h-8 px-3 rounded-xl bg-tao-card border border-tao-border text-xs">Mark invalidated</button>
            <input data-outcome="${dec.id}" placeholder="Actual outcome…" value="${(dec.outcome||'').replace(/"/g,'&quot;')}" class="flex-1 h-8 rounded-xl bg-tao-card border border-tao-border px-3 text-xs" />
            <button data-saveoutcome="${dec.id}" class="h-8 px-3 rounded-xl bg-white text-black text-xs">Save</button>
          </div>
        </div>
      `).join('') || '<div class="p-8 text-center text-tao-muted">No decisions logged.</div>'}
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
  return `
  <div class="p-4 md:p-6 max-w-[1100px] mx-auto space-y-6">
    <h1 class="text-2xl font-semibold">Weekly Intelligence</h1>
    <p class="text-sm text-tao-muted">Actual activity vs stated goals. Bottlenecks, wasted effort, unfinished projects, recurring patterns.</p>

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
      ${[
        {k:'Active', v:a.totals.active, sub:'vs 5-7 healthy'},
        {k:'Done', v:a.totals.done, sub:'completed'},
        {k:'Overdue', v:a.totals.overdue, sub:'needs reschedule', danger:true},
        {k:'Blocked', v:a.totals.blocked, sub:'unblock or pause'},
      ].map(c=>`
        <div class="rounded-2xl bg-tao-surface border border-tao-border p-4">
          <div class="text-xs text-tao-muted uppercase tracking-widest">${c.k}</div>
          <div class="text-3xl font-bold mt-1 ${c.danger && c.v>0?'text-tao-danger':''}">${c.v}</div>
          <div class="text-xs text-tao-muted">${c.sub}</div>
        </div>
      `).join('')}
    </div>

    <div class="grid lg:grid-cols-3 gap-4">
      <div class="lg:col-span-2 rounded-2xl bg-tao-surface border border-tao-border p-4">
        <h3 class="font-semibold">Bottlenecks detected</h3>
        <div class="mt-3 space-y-2">
          ${a.bottlenecks.length? a.bottlenecks.map(b=>`<div class="rounded-xl bg-tao-card border border-tao-border p-3 text-sm flex gap-2"><span>⚠</span><span>${b}</span></div>`).join('') : '<div class="text-sm text-emerald-400">✓ No major bottlenecks. Keep shipping.</div>'}
        </div>
        <div class="mt-4 rounded-xl bg-tao-accent text-black p-4">
          <div class="text-xs font-mono uppercase tracking-widest">Proliferation risk</div>
          <div class="font-semibold mt-1">${a.totals.proliferation}</div>
          <div class="text-sm mt-1">Ideas captured but not scored: <b>${a.totals.ideasCaptured}</b>. Decisions pending: <b>${a.totals.pendingDecisions}</b> (validated: ${a.totals.validated}).</div>
        </div>
      </div>
      <div class="space-y-4">
        <div class="rounded-2xl bg-tao-surface border border-tao-border p-4">
          <h3 class="font-semibold text-sm">Stale projects (>7d)</h3>
          <div class="mt-2 space-y-2 text-sm">${a.stale.length? a.stale.map(p=>`<div class="flex justify-between"><span class="truncate pr-2">${p.name}</span><span class="text-tao-muted text-xs">${fmtDate(p.updated)}</span></div>`).join('') : '<span class=text-tao-muted>No stale projects</span>'}</div>
        </div>
        <div class="rounded-2xl bg-tao-surface border border-tao-border p-4">
          <h3 class="font-semibold text-sm">Recurring pattern check</h3>
          <ul class="text-sm mt-2 space-y-2 list-disc ml-4 text-tao-muted">
            <li>Are you starting more than you finish? (Active ${a.totals.active} vs Done ${a.totals.done})</li>
            <li>Do blockers repeat? Search blockers: "${[...new Set(a.blocked.flatMap(p=>p.blockers))].slice(0,3).join(', ') || 'none'}"</li>
            <li>Ideas  without promotion → idea debt. Score 2 ideas today.</li>
          </ul>
        </div>
      </div>
    </div>

    <div class="rounded-2xl bg-tao-card border border-tao-border p-4">
      <h3 class="font-semibold">Activity vs Goals</h3>
      <p class="text-xs text-tao-muted mt-1">TAO compares your daily priorities and sessions (when logged) to scrutiny. For now, heuristic based on project state.</p>
      <div class="mt-3 h-2 rounded-full bg-tao-surface overflow-hidden flex">
        <div class="bg-tao-accent" style="width:${Math.min(100, Math.round((a.totals.done/(a.totals.done+a.totals.active||1))*100))}%"></div>
        <div class="bg-tao-border flex-1"></div>
      </div>
      <div class="text-xs text-tao-muted mt-1">Completion ratio: ${a.totals.done} done / ${a.totals.done + a.totals.active} total tracked</div>
    </div>
  </div>
  `
}

function viewDev(){
  return `
  <div class="p-4 md:p-6 max-w-[1100px] mx-auto space-y-4">
    <div class="flex flex-wrap gap-3 items-center">
      <h1 class="text-2xl font-semibold">Developer Mode</h1>
      <button id="pickRepo" class="ml-auto h-9 px-4 rounded-xl bg-tao-accent text-black text-sm font-semibold">Pick local folder</button>
      <button id="refreshDev" class="h-9 px-4 rounded-xl bg-tao-card border border-tao-border text-sm">Refresh snapshot</button>
    </div>
    <p class="text-sm text-tao-muted">Inspect local Git repos, commits, TODOs, tests, recent changes — reconstruct where development stopped. Works offline. For full FS access use Chrome/Edge desktop.</p>

    <div class="grid lg:grid-cols-3 gap-4">
      <div class="lg:col-span-2 rounded-2xl bg-tao-surface border border-tao-border p-4">
        <div class="flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-emerald-500"></span><span class="font-mono text-sm">${devSnapshot.name}</span><span class="text-xs px-2 py-1 rounded-full bg-tao-card border border-tao-border">${devSnapshot.branch}</span><span class="text-xs text-tao-muted">${devSnapshot.dirty?'• dirty (uncommitted)':'clean'}</span></div>
        <div class="mt-4">
          <div class="text-xs uppercase tracking-widest text-tao-muted">Recent commits</div>
          <div class="mt-2 space-y-2 font-mono text-xs">
            ${devSnapshot.commits.map(c=>`<div class="flex gap-3"><span class="text-tao-accent">${c.hash}</span><span class="flex-1">${c.msg}</span><span class="text-tao-muted">${c.ago}</span></div>`).join('')}
          </div>
        </div>
        <div class="mt-4">
          <div class="text-xs uppercase tracking-widest text-tao-muted">Recent changes</div>
          <div class="mt-2 space-y-1 text-xs">
            ${devSnapshot.recent.map(r=>`<div class="flex justify-between"><span>${r.file}</span><span class="text-tao-muted">${new Date(r.modified).toLocaleString()} • ${(r.size/1024).toFixed(1)}KB</span></div>`).join('')}
          </div>
        </div>
      </div>
      <div class="space-y-4">
        <div class="rounded-2xl bg-tao-accent text-black p-4">
          <div class="text-xs font-mono uppercase tracking-widest">Where did you stop?</div>
          <div class="text-sm font-medium mt-2">${devSnapshot.todos[0] ? `Last TODO in ${devSnapshot.todos[0].file}: "${devSnapshot.todos[0].lines[0]}"` : 'No TODOs found. Check git diff.'}</div>
          <div class="text-xs mt-2">TAO suggests: <b>Run tests, then open that file and implement the TODO — that's your next physical action.</b></div>
        </div>
        <div class="rounded-2xl bg-tao-surface border border-tao-border p-4">
          <div class="text-xs uppercase tracking-widest text-tao-muted">TODOs / FIXMEs</div>
          <div class="mt-2 space-y-2 text-xs">
            ${devSnapshot.todos.length? devSnapshot.todos.map(t=>`<div><div class="font-mono font-medium">${t.file} (${t.count})</div><div class="text-tao-muted">${t.lines.join('<br/>')}</div></div>`).join('') : '<div class=text-tao-muted>No TODOs</div>'}
          </div>
        </div>
        <div class="rounded-2xl bg-tao-surface border border-tao-border p-4">
          <div class="text-xs uppercase tracking-widest text-tao-muted">Test status (heuristic)</div>
          <div class="text-sm mt-1">No test runner detected in snapshot. Add <code class="bg-tao-card px-1 rounded">npm test / pytest</code> to project.</div>
          <button id="addDevProject" class="mt-3 w-full h-8 rounded-xl bg-white text-black text-xs font-medium">Create Project from repo TODO</button>
        </div>
      </div>
    </div>
  </div>
  `
}

function viewStudy(){
  const d=store.get()
  return `
  <div class="p-4 md:p-6 max-w-[1100px] mx-auto space-y-4">
    <div class="flex items-center gap-3">
      <h1 class="text-2xl font-semibold">Study Mode</h1>
      <button id="addCourseBtn" class="ml-auto h-9 px-4 rounded-xl bg-tao-accent text-black text-sm font-semibold">+ Add course</button>
      <button id="logSessionBtn" class="h-9 px-4 rounded-xl bg-tao-card border border-tao-border text-sm">Log session</button>
    </div>
    <div class="grid lg:grid-cols-3 gap-4">
      <div class="lg:col-span-2 space-y-3">
        ${d.courses.map(c=>`
          <div class="rounded-2xl bg-tao-surface border border-tao-border p-4">
            <div class="flex items-start justify-between">
              <div><div class="font-mono text-xs text-tao-muted">${c.code}</div><h3 class="font-semibold">${c.name}</h3><div class="text-xs text-tao-muted">Priority ${c.priority}/5</div></div>
              <span class="text-xs px-2 py-1 rounded-full bg-tao-accent text-black">${c.weakAreas?.length||0} weak areas</span>
            </div>
            <div class="mt-3 grid sm:grid-cols-3 gap-3 text-xs">
              <div class="rounded-xl bg-tao-card border border-tao-border p-3"><div class="font-semibold">Topics</div><div class="mt-1 text-tao-muted">${c.topics.join(', ')||'—'}</div></div>
              <div class="rounded-xl bg-red-500/10 border border-red-500/20 p-3"><div class="font-semibold text-red-300">Weak areas</div><div class="mt-1">${c.weakAreas.join(', ')||'— none'}</div></div>
              <div class="rounded-xl bg-tao-card border border-tao-border p-3"><div class="font-semibold">Deadlines</div><div class="mt-1">${c.deadlines.map(d=>`${d.title} — ${fmtDate(d.date)}`).join('<br/>')||'—'}</div></div>
            </div>
            <div class="mt-3 flex gap-2">
              <button data-study="${c.id}" class="h-8 px-3 rounded-xl bg-white text-black text-xs font-medium">Study this next</button>
              <button data-editcourse="${c.id}" class="h-8 px-3 rounded-xl bg-tao-card border border-tao-border text-xs">Edit</button>
            </div>
          </div>
        `).join('') || '<div class="p-8 text-center text-tao-muted">No courses. Add your semester courses.</div>'}
      </div>
      <div class="space-y-4">
        <div class="rounded-2xl bg-tao-accent text-black p-4">
          <div class="text-xs font-mono uppercase tracking-widest">Revision priority</div>
          <div class="mt-2 space-y-2 text-sm">
            ${[...d.courses].sort((a,b)=> (b.priority - a.priority) || (b.weakAreas.length - a.weakAreas.length)).slice(0,3).map(c=>`<div class="flex justify-between"><span>${c.code} — ${c.name}</span><span class="font-mono">${c.weakAreas.length? 'weak: '+c.weakAreas[0] : 'review'}</span></div>`).join('') || '—'}
          </div>
          <div class="text-xs mt-2">TAO: focus 70% time on weak areas, 30% on strengths. Deep work 90 min blocks.</div>
        </div>
        <div class="rounded-2xl bg-tao-surface border border-tao-border p-4">
          <h3 class="font-semibold text-sm">Recent sessions</h3>
          <div class="mt-2 space-y-2 text-xs">
            ${d.sessions.filter(s=>s.type==='study').slice(0,6).map(s=>`<div class="flex justify-between"><span>${s.courseCode||'—'} • ${s.mins}m</span><span class="text-tao-muted">${new Date(s.date).toLocaleDateString()}</span></div>`).join('') || '<span class=text-tao-muted>No sessions logged</span>'}
          </div>
        </div>
      </div>
    </div>
  </div>
  `
}

function viewBusiness(){
  const d=store.get()
  return `
  <div class="p-4 md:p-6 max-w-[1100px] mx-auto space-y-4">
    <div class="flex items-center gap-3">
      <h1 class="text-2xl font-semibold">Business Mode</h1>
      <button id="addOppBtn" class="ml-auto h-9 px-4 rounded-xl bg-tao-accent text-black text-sm font-semibold">+ New opportunity</button>
    </div>
    <div class="grid lg:grid-cols-3 gap-4">
      <div class="lg:col-span-2 space-y-3">
        ${d.opportunities.map(o=>`
          <div class="rounded-2xl bg-tao-surface border border-tao-border p-4">
            <div class="flex items-start justify-between gap-2">
              <h3 class="font-semibold">${o.title}</h3>
              <span class="text-xs px-2 py-1 rounded-full border ${o.stage==='revenue'?'bg-emerald-500 text-black': o.stage==='building'?'bg-amber-400 text-black':'bg-tao-card border-tao-border'}">${o.stage}</span>
            </div>
            <div class="text-xs text-tao-muted mt-1">Revenue: ${o.revenue? '₦'+Number(o.revenue).toLocaleString('en-NG'): '₦0'} • Prospects: ${o.prospects?.length||0}</div>
            <div class="grid sm:grid-cols-2 gap-3 mt-3 text-xs">
              <div class="rounded-xl bg-tao-card border border-tao-border p-3"><div class="font-semibold">Assumptions</div><ul class="list-disc ml-4 mt-1">${o.assumptions.map(a=>`<li>${a}</li>`).join('')||'<li>—</li>'}</ul></div>
              <div class="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3"><div class="font-semibold">Validation evidence</div><ul class="list-disc ml-4 mt-1">${o.evidence.map(e=>`<li>${e}</li>`).join('')||'<li class=text-tao-muted>None yet — interview!</li>'}</ul></div>
            </div>
            <div class="mt-3 flex gap-2">
              <button data-oppnext="${o.id}" class="h-8 px-3 rounded-xl bg-white text-black text-xs font-medium">Define next validation</button>
              <button data-editopp="${o.id}" class="h-8 px-3 rounded-xl bg-tao-card border border-tao-border text-xs">Edit</button>
            </div>
          </div>
        `).join('') || '<div class="p-8 text-center text-tao-muted">No opportunities. Capture, then validate with evidence.</div>'}
      </div>
      <div class="space-y-4">
        <div class="rounded-2xl bg-tao-surface border border-tao-border p-4">
          <h3 class="font-semibold text-sm">Pipeline</h3>
          <div class="mt-3 space-y-2 text-xs">
            ${['idea','validation','building','revenue'].map(s=>{
              const count=d.opportunities.filter(o=>o.stage===s).length
              return `<div class="flex justify-between"><span class="capitalize">${s}</span><span class="font-mono">${count}</span></div>`
            }).join('')}
          </div>
        </div>
        <div class="rounded-2xl bg-tao-accent text-black p-4">
          <div class="text-xs font-mono uppercase tracking-widest">Validation rule</div>
          <div class="text-sm font-medium mt-2">No revenue without evidence. Every opportunity needs an assumption + a test + a next action.</div>
        </div>
      </div>
    </div>
  </div>
  `
}

// --- Renderer ---
function render(){
  const el=document.getElementById('content')
  let html=''
  if(current==='command') html=viewCommand()
  else if(current==='projects') html=viewProjects()
  else if(current==='memory') html=viewMemory()
  else if(current==='decisions') html=viewDecisions()
  else if(current==='ideas') html=viewIdeas()
  else if(current==='planning') html=viewPlanning()
  else if(current==='weekly') html=viewWeekly()
  else if(current==='dev') html=viewDev()
  else if(current==='study') html=viewStudy()
  else if(current==='business') html=viewBusiness()
  el.innerHTML=html
  bind()
  document.getElementById('statusLeft').textContent = `TAO • ${routes.find(r=>r.id===current)?.label || current} • local-first`
}

function bind(){
  // Command
  document.getElementById('saveDaily')?.addEventListener('click', ()=>{
    const prios=[0,1,2].map(i=> document.querySelector(`[data-prio="${i}"]`)?.value.trim()).filter(Boolean)
    const blockers=(document.getElementById('dailyBlockers')?.value||'').split('\n').map(s=>s.trim()).filter(Boolean)
    const timeBlocks=['deep','admin','classes'].map(k=>{
      const inp=document.querySelector(`[data-time="${k}"]`)
      return { k, mins: parseInt(inp?.value||'0') }
    })
    const d=store.get()
    d.daily[todayISO()] = { priorities: prios, blockers, timeBlocks, nextActions: prios }
    store.set({ daily: d.daily })
    toast('Day saved locally ✓')
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
  document.getElementById('sortProjects')?.addEventListener('change', render)
  document.querySelectorAll('[data-filter]').forEach(b=>{
    b.addEventListener('click', ()=>{
      const f=b.dataset.filter
      const all=store.get().projects
      const filtered= f==='all'? all : all.filter(p=>p.status===f)
      const grid=document.getElementById('projectGrid')
      // quick filter without full re-render: hide non-matching
      document.querySelectorAll('[data-proj]').forEach(el=>{
        const id=el.dataset.proj
        const p=all.find(x=>x.id===id)
        el.style.display = (f==='all' || p.status===f) ? '' : 'none'
      })
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
      const t=b.dataset.memfilter
      const q=document.getElementById('globalSearch')?.value || ''
      // just re-render filtered view via DOM hide
      document.querySelectorAll('#memGrid > div').forEach((el,i)=>{
        const m=store.get().memories[i]
        if(!m) return
        el.style.display = (t==='all' || m.type===t) ? '' : 'none'
      })
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
        store.promoteIdea(b.dataset.promote)
        store.addProject({ name: idea.title, objective: idea.description, area:'technology', strategicImportance: 3, effort:'M', nextAction: next })
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
  document.getElementById('addCourseBtn')?.addEventListener('click', ()=>{
    const code=prompt('Course code (e.g., CSC 421)')||''
    if(!code) return
    const name=prompt('Course name')||code
    const d=store.get()
    d.courses.unshift({ id: uid(), code, name, topics:[], weakAreas:[], deadlines:[], priority:3, sessions:[] })
    store.set({ courses: d.courses }); render()
  })
  document.getElementById('logSessionBtn')?.addEventListener('click', ()=>{
    const d=store.get()
    if(!d.courses.length) return alert('Add a course first')
    const code=prompt(`Course code? (${d.courses.map(c=>c.code).join(', ')})`)||d.courses[0].code
    const mins=parseInt(prompt('Minutes studied?','60')||'0')
    const weak=prompt('Weak area studied? (optional)')||''
    d.sessions.unshift({ id:uid(), type:'study', courseCode:code, mins, date: new Date().toISOString(), weakArea: weak })
    store.set({ sessions: d.sessions }); toast('Session logged'); render()
  })
  document.querySelectorAll('[data-study]').forEach(b=>{
    b.addEventListener('click', ()=>{
      const c=store.get().courses.find(x=>x.id===b.dataset.study)
      const next=`Study ${c.code}: ${c.weakAreas[0] || c.topics[0] || 'review notes'} — 90 min deep work, no phone`
      if(confirm(`Set next action for study project?\n${next}\n\nCreate/ensure project exists?`)){
        const existing=store.get().projects.find(p=>p.name.includes(c.code))
        if(existing) store.updateProject(existing.id, { nextAction: next })
        else {
          try{ store.addProject({ name:`Study — ${c.code} ${c.name}`, area:'academics', objective:`Master ${c.name}`, strategicImportance:5, effort:'M', nextAction: next })}catch(e){ alert(e.message) }
        }
        go('projects')
      }
    })
  })

  // Business
  document.getElementById('addOppBtn')?.addEventListener('click', ()=>{
    const title=prompt('Opportunity title?')||''
    if(!title) return
    const d=store.get()
    d.opportunities.unshift({ id:uid(), title, stage:'idea', assumptions:[], evidence:[], revenue:0, prospects:[] })
    store.set({ opportunities: d.opportunities }); render()
  })
  document.querySelectorAll('[data-oppnext]').forEach(b=>{
    b.addEventListener('click', ()=>{
      const opp=store.get().opportunities.find(o=>o.id===b.dataset.oppnext)
      const next=prompt(`Next validation for "${opp.title}" — what evidence will you collect?`, 'Interview 5 users with 3 questions')
      if(!next) return
      // also create or update project
      const proj=store.get().projects.find(p=>p.name===opp.title)
      if(proj) store.updateProject(proj.id, { nextAction: next })
      else {
        try{ store.addProject({ name: opp.title, objective:`Validate ${opp.title}`, area:'business', strategicImportance:4, effort:'S', nextAction: next })}catch(e){ alert(e.message) }
      }
      go('projects')
    })
  })
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
    document.getElementById('deleteProj').classList.add('hidden')
  }
  dlg.showModal()
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
    ...d.decisions.map(dec=>({ label:`Decision: ${dec.title}`, desc: dec.status, action:()=> go('decisions'), score:0 })),
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
  // G then ...
  if(e.key.toLowerCase()==='g' && !isInput){
    const handler=(ev)=>{
      const k=ev.key.toLowerCase()
      const map={ c:'command', p:'projects', m:'memory', d:'decisions', i:'ideas', v:'dev', s:'study', b:'business', w:'weekly', e:'planning' }
      if(map[k]){ ev.preventDefault(); go(map[k]) }
      document.removeEventListener('keydown', handler)
    }
    setTimeout(()=> document.addEventListener('keydown', handler, { once:true }), 0)
  }
})

// clock
setInterval(()=>{ const el=document.getElementById('clock'); if(el) el.textContent=new Date().toLocaleTimeString('en-NG',{hour:'2-digit',minute:'2-digit'}) }, 1000)
store.subscribe(()=>{ /* keep badge updated */ })

// init
renderNav()
render()
