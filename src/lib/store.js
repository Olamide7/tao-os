// TAO Store — local-first persisted memory. Single source of truth.
// Uses localStorage with JSON. Designed to be swapped for SQLite/OPFS later.

const KEY = 'tao.v1'
const uid = () => Math.random().toString(36).slice(2,9) + Date.now().toString(36).slice(-4)
const nowISO = () => new Date().toISOString()
const todayISO = () => new Date().toISOString().slice(0,10)

export const defaultData = () => ({
  meta: { created: nowISO(), version: 1, owner: 'TAO User — Nigerian Student / Dev / Entrepreneur' },
  daily: {}, // date -> { priorities, blockers, nextActions, timeBlocks, reflection }
  projects: [],
  memories: [],
  decisions: [],
  ideas: [],
  courses: [],
  opportunities: [],
  sessions: [], // study/business sessions
  dev: { repos: [] },
  settings: { aiProvider: 'mock', aiKey: '' }
})

export function load(){
  try{
    const raw = localStorage.getItem(KEY)
    if(!raw) return defaultData()
    const parsed = JSON.parse(raw)
    // migrations: ensure arrays exist
    for(const k of ['projects','memories','decisions','ideas','courses','opportunities','sessions']){
      if(!Array.isArray(parsed[k])) parsed[k]=[]
    }
    if(!parsed.daily) parsed.daily={}
    if(!parsed.dev) parsed.dev={repos:[]}
    if(!parsed.settings) parsed.settings={aiProvider:'mock', aiKey:''}
    return parsed
  }catch(e){ console.error(e); return defaultData() }
}

let data = load()
const listeners = new Set()
export const store = {
  get(){ return data },
  set(patch){
    data = { ...data, ...patch }
    persist()
  },
  update(fn){
    data = fn(data)
    persist()
  },
  subscribe(fn){ listeners.add(fn); return ()=>listeners.delete(fn) },
  reset(){ data = defaultData(); persist() },
  exportJSON(){ return JSON.stringify(data, null, 2) },
  importJSON(json){
    const parsed = JSON.parse(json)
    data = parsed
    persist()
  },
  // helpers
  addProject(p){
    const proj = {
      id: uid(), created: nowISO(), updated: nowISO(),
      status: p.status || 'active',
      name: p.name, objective: p.objective || '',
      area: p.area || 'technology',
      strategicImportance: p.strategicImportance ?? 3,
      effort: p.effort || 'M', // S M L XL
      deadline: p.deadline || null,
      milestones: p.milestones || [],
      blockers: p.blockers || [],
      dependencies: p.dependencies || [],
      nextAction: p.nextAction || '',
      progress: p.progress ?? 0,
      ...p
    }
    // enforcement
    if(proj.status==='active' && !proj.nextAction?.trim()){
      throw new Error('Active projects require a next physical action. Add nextAction or set status to paused.')
    }
    data.projects.unshift(proj)
    persist(); return proj
  },
  updateProject(id, patch){
    const idx = data.projects.findIndex(p=>p.id===id)
    if(idx===-1) return null
    const next = { ...data.projects[idx], ...patch, updated: nowISO() }
    if(next.status==='active' && !next.nextAction?.trim()) throw new Error('Active projects require a next action')
    data.projects[idx]=next; persist(); return next
  },
  deleteProject(id){ data.projects = data.projects.filter(p=>p.id!==id); persist() },

  addMemory(m){
    const mem={ id:uid(), created: nowISO(), type: m.type||'knowledge', content: m.content, tags: m.tags||[], linkedProject: m.linkedProject||null, title: m.title||'' }
    data.memories.unshift(mem); persist(); return mem
  },
  addDecision(d){
    const dec={ id:uid(), created: nowISO(), status:'pending', confidence: d.confidence??60, assumptions: d.assumptions||[], evidence: d.evidence||[], expectedOutcome: d.expectedOutcome||'', outcome:'', ...d }
    data.decisions.unshift(dec); persist(); return dec
  },
  updateDecision(id,patch){
    const i=data.decisions.findIndex(d=>d.id===id); if(i===-1) return null
    data.decisions[i]={...data.decisions[i], ...patch}; persist(); return data.decisions[i]
  },
  addIdea(i){
    const idea={ id:uid(), created: nowISO(), status:'captured', title:i.title, description:i.description||'', scores: i.scores||{novelty:3, feasibility:3, impact:3, alignment:3}, tags:i.tags||[] }
    idea.total = calcIdeaScore(idea.scores)
    data.ideas.unshift(idea); persist(); return idea
  },
  scoreIdea(id, scores){
    const it=data.ideas.find(x=>x.id===id); if(!it) return null
    it.scores={...it.scores, ...scores}; it.total=calcIdeaScore(it.scores); persist(); return it
  },
  promoteIdea(id){
    const idea=data.ideas.find(x=>x.id===id); if(!idea) throw new Error('Idea not found')
    if(idea.total < 10) throw new Error('Idea score too low to promote (need ≥10/20). Refine first.')
    idea.status='promoted'
    // create project draft — still enforces nextAction
    persist(); return idea
  }
}

function calcIdeaScore(s){
  // weighted: impact 30%, feasibility 25%, alignment 25%, novelty 20% => max 5*? normalized to /20
  const w = s.impact*1.2 + s.feasibility*1.0 + s.alignment*1.0 + s.novelty*0.8
  return Math.round(w*10)/10 // out of 20
}

function persist(){
  localStorage.setItem(KEY, JSON.stringify(data))
  listeners.forEach(fn=>fn(data))
  updateBadges()
}

function updateBadges(){
  // called from store; also expose for init
  const bad = document.getElementById('enforcementBadge')
  if(bad){
    const active = data.projects.filter(p=>p.status==='active')
    const missing = active.filter(p=>!p.nextAction?.trim())
    if(missing.length>0){
      bad.innerHTML = `<span class="text-tao-danger">${missing.length} active project(s) missing next action — fix now</span>`
    } else {
      bad.innerHTML = `<span class="text-emerald-400">✓ ${active.length} active — all have next actions</span>`
    }
  }
  const sp=document.getElementById('statusProjects')
  const si=document.getElementById('statusIdeas')
  const ss=document.getElementById('storeSize')
  if(sp) sp.textContent = `${data.projects.length} projects`
  if(si) si.textContent = `${data.ideas.length} ideas`
  if(ss){
    try{ ss.textContent = `${(new Blob([JSON.stringify(data)]).size/1024).toFixed(1)} KB` }catch{}
  }
}

export { uid, nowISO, todayISO, calcIdeaScore }
// init badge after DOM ready
setTimeout(updateBadges, 0)
