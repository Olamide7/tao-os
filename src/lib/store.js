// TAO Store — local-first persisted memory. Single source of truth.
// Uses localStorage with JSON. Designed to be swapped for SQLite/OPFS later.
// UI-independent: no DOM manipulation. Use subscribe() for UI updates.

const KEY = 'tao.v1'
export const SCHEMA_VERSION = 1
const uid = () => Math.random().toString(36).slice(2,9) + Date.now().toString(36).slice(-4)
const nowISO = () => new Date().toISOString()
const todayISO = () => new Date().toISOString().slice(0,10)

export const defaultData = () => ({
  meta: { created: nowISO(), version: SCHEMA_VERSION, seeded: false, owner: 'TAO User — Nigerian Student / Dev / Entrepreneur' },
  daily: {},
  projects: [],
  memories: [],
  decisions: [],
  ideas: [],
  courses: [],
  opportunities: [],
  sessions: [],
  activity: [],
  dev: { repos: [] },
  settings: { aiProvider: 'mock', aiKey: '' }
})

// ---- Schema validation ----
const ALLOWED_PROJECT_STATUS = new Set(['active','paused','done','archived'])
const ALLOWED_EFFORT = new Set(['S','M','L','XL'])
const ALLOWED_AREAS = new Set(['technology','academics','business','personal'])
const ALLOWED_MEMORY_TYPES = new Set(['project','decision','goal','preference','knowledge','person','business','academic','technology','idea'])
const ALLOWED_DECISION_STATUS = new Set(['pending','validated','invalidated'])
const ALLOWED_IDEA_STATUS = new Set(['captured','promoted','archived'])
const ALLOWED_OPP_STAGE = new Set(['idea','validation','building','revenue'])
const ALLOWED_ACTIVITY_TYPE = new Set(['project_created','project_updated','project_deleted','project_completed','focus_session','capture','decision_created','decision_reviewed','daily_saved','idea_captured','idea_promoted','memory_created','course_session','opportunity_updated'])

function isString(v){ return typeof v === 'string' }
function isArray(v){ return Array.isArray(v) }
function isObject(v){ return v !== null && typeof v === 'object' && !Array.isArray(v) }

export function validateImportData(parsed){
  if(!isObject(parsed)) throw new Error('Import must be an object')
  if(!isObject(parsed.meta) || typeof parsed.meta.version !== 'number') throw new Error('Missing meta.version')
  if(parsed.meta.version !== SCHEMA_VERSION) throw new Error(`Unsupported schema version ${parsed.meta.version} (expected ${SCHEMA_VERSION})`)
  for(const k of ['projects','memories','decisions','ideas','courses','opportunities','sessions','activity']){
    if(parsed[k] !== undefined && !isArray(parsed[k])) throw new Error(`Invalid ${k}: must be array`)
  }
  if(parsed.daily !== undefined && !isObject(parsed.daily)) throw new Error('Invalid daily')
  if(parsed.dev !== undefined && !isObject(parsed.dev)) throw new Error('Invalid dev')
  if(parsed.settings !== undefined && !isObject(parsed.settings)) throw new Error('Invalid settings')
  if(parsed.projects){
    for(const p of parsed.projects){
      if(!isObject(p)) throw new Error('Invalid project entry')
      if(!isString(p.id) || !isString(p.name)) throw new Error('Project missing id/name')
      if(p.status && !ALLOWED_PROJECT_STATUS.has(p.status)) throw new Error(`Invalid project status: ${p.status}`)
      if(p.effort && !ALLOWED_EFFORT.has(p.effort)) throw new Error(`Invalid effort: ${p.effort}`)
      if(p.area && !ALLOWED_AREAS.has(p.area)) throw new Error(`Invalid area: ${p.area}`)
      if(p.strategicImportance !== undefined && (typeof p.strategicImportance !== 'number' || p.strategicImportance <1 || p.strategicImportance>5)) throw new Error('Invalid strategicImportance')
      if(p.nextAction !== undefined && typeof p.nextAction !== 'string') throw new Error('Invalid nextAction')
      if(p.linkedIdeaId !== undefined && p.linkedIdeaId!==null && typeof p.linkedIdeaId!=='string') throw new Error('Invalid linkedIdeaId')
    }
  }
  if(parsed.memories){
    for(const m of parsed.memories){
      if(!isObject(m)) throw new Error('Invalid memory entry')
      if(!isString(m.id) || !isString(m.content)) throw new Error('Memory missing id/content')
      if(m.type && !ALLOWED_MEMORY_TYPES.has(m.type)) throw new Error(`Invalid memory type: ${m.type}`)
      if(m.linkedProject!==undefined && m.linkedProject!==null && typeof m.linkedProject!=='string') throw new Error('Invalid linkedProject')
    }
  }
  if(parsed.decisions){
    for(const d of parsed.decisions){
      if(!isObject(d)) throw new Error('Invalid decision entry')
      if(!isString(d.id) || !isString(d.title)) throw new Error('Decision missing id/title')
      if(d.status && !ALLOWED_DECISION_STATUS.has(d.status)) throw new Error(`Invalid decision status: ${d.status}`)
      if(d.linkedProject!==undefined && d.linkedProject!==null && typeof d.linkedProject!=='string') throw new Error('Invalid linkedProject')
    }
  }
  if(parsed.ideas){
    for(const i of parsed.ideas){
      if(!isObject(i)) throw new Error('Invalid idea entry')
      if(!isString(i.id) || !isString(i.title)) throw new Error('Idea missing id/title')
      if(i.status && !ALLOWED_IDEA_STATUS.has(i.status)) throw new Error(`Invalid idea status: ${i.status}`)
      if(i.linkedProjectId!==undefined && i.linkedProjectId!==null && typeof i.linkedProjectId!=='string') throw new Error('Invalid linkedProjectId')
    }
  }
  if(parsed.activity){
    for(const a of parsed.activity){
      if(!isObject(a)) throw new Error('Invalid activity entry')
      if(!isString(a.id) || !isString(a.type) || !isString(a.timestamp)) throw new Error('Activity missing id/type/timestamp')
    }
  }
  return true
}

function migrate(raw){
  const data = { ...raw }
  if(!data.meta) data.meta = { created: nowISO(), version: SCHEMA_VERSION, seeded: false, owner: 'TAO User' }
  if(typeof data.meta.version !== 'number') data.meta.version = 1
  if(typeof data.meta.seeded !== 'boolean'){
    data.meta.seeded = Array.isArray(data.projects) && data.projects.length > 0
  }
  for(const k of ['projects','memories','decisions','ideas','courses','opportunities','sessions','activity']){
    if(!Array.isArray(data[k])) data[k]=[]
  }
  if(!data.daily || typeof data.daily !== 'object' || Array.isArray(data.daily)) data.daily={}
  if(!data.dev || typeof data.dev !== 'object') data.dev={repos:[]}
  if(!data.dev.repos) data.dev.repos=[]
  if(!data.settings || typeof data.settings !== 'object') data.settings={aiProvider:'mock', aiKey:''}
  if(typeof data.settings.aiProvider !== 'string') data.settings.aiProvider='mock'
  if(typeof data.settings.aiKey !== 'string') data.settings.aiKey=''
  // ensure activity entries have required fields
  data.activity = data.activity.filter(a=> a && typeof a.id==='string' && typeof a.type==='string')
  // ensure cross-module link fields exist (backward compat)
  for(const p of data.projects){ if(!('linkedIdeaId' in p)) p.linkedIdeaId = p.linkedIdeaId||null }
  for(const m of data.memories){ if(!('linkedProject' in m)) m.linkedProject=null; if(!('archived' in m)) m.archived=false }
  for(const d of data.decisions){ if(!('linkedProject' in d)) d.linkedProject=null; if(!('reviewDate' in d)) d.reviewDate=d.reviewDate||null }
  for(const i of data.ideas){ if(!('linkedProjectId' in i)) i.linkedProjectId=null }
  for(const c of data.courses){ if(!('linkedProjectId' in c)) c.linkedProjectId=null }
  for(const o of data.opportunities){ if(!('linkedProjectId' in o)) o.linkedProjectId=null }
  return data
}

export function load(){
  try{
    const raw = localStorage.getItem(KEY)
    if(!raw) return defaultData()
    const parsed = JSON.parse(raw)
    return migrate(parsed)
  }catch(e){ console.error('[TAO] load failed', e); return defaultData() }
}

let data = load()
const listeners = new Set()
let lastPersistError = null
export function getLastPersistError(){ return lastPersistError }

function safeClone(obj){ return JSON.parse(JSON.stringify(obj)) }

function logActivity(type, entityType, entityId, meta={}){
  if(!ALLOWED_ACTIVITY_TYPE.has(type)) type='capture'
  const entry = { id: uid(), type, entityType, entityId, action: type, timestamp: nowISO(), meta }
  data.activity.unshift(entry)
  // keep last 500
  if(data.activity.length>500) data.activity = data.activity.slice(0,500)
}

export const store = {
  get(){ return data },
  set(patch){
    const next = { ...data, ...patch }
    for(const k of ['meta','daily','projects','memories','decisions','ideas','courses','opportunities','sessions','activity','dev','settings']){
      if(!(k in patch)) continue
      if(patch[k] === undefined) next[k] = data[k]
    }
    if(!next.meta) next.meta = data.meta
    data = next
    persist()
  },
  update(fn){
    const result = fn(safeClone(data))
    if(result && typeof result === 'object') data = migrate(result)
    persist()
  },
  subscribe(fn){ listeners.add(fn); return ()=>listeners.delete(fn) },
  reset(){ data = defaultData(); persist() },
  exportJSON(){
    const copy = safeClone(data)
    if(copy.settings) copy.settings.aiKey = ''
    return JSON.stringify(copy, null, 2)
  },
  importJSON(json){
    let parsed
    try{ parsed = JSON.parse(json) }catch(e){ throw new Error('Invalid JSON: ' + e.message) }
    validateImportData(parsed)
    const backup = safeClone(data)
    try{
      const migrated = migrate(parsed)
      data = migrated
      persist()
    }catch(e){
      data = backup
      try{ persist() }catch{}
      throw e
    }
  },
  // helpers with activity logging
  addProject(p){
    const proj = {
      id: uid(), created: nowISO(), updated: nowISO(),
      status: p.status || 'active',
      name: p.name, objective: p.objective || '',
      area: p.area || 'technology',
      strategicImportance: p.strategicImportance ?? 3,
      effort: p.effort || 'M',
      deadline: p.deadline || null,
      milestones: p.milestones || [],
      blockers: p.blockers || [],
      dependencies: p.dependencies || [],
      nextAction: p.nextAction || '',
      progress: p.progress ?? 0,
      linkedIdeaId: p.linkedIdeaId||null,
      ...p
    }
    if(!ALLOWED_PROJECT_STATUS.has(proj.status)) throw new Error(`Invalid status: ${proj.status}`)
    if(!ALLOWED_EFFORT.has(proj.effort)) throw new Error(`Invalid effort: ${proj.effort}`)
    if(!ALLOWED_AREAS.has(proj.area)) throw new Error(`Invalid area: ${proj.area}`)
    if(proj.status==='active' && !proj.nextAction?.trim()){
      throw new Error('Active projects require a next physical action. Add nextAction or set status to paused.')
    }
    data.projects.unshift(proj)
    logActivity('project_created','project',proj.id,{ name: proj.name, linkedIdeaId: proj.linkedIdeaId })
    persist(); return proj
  },
  updateProject(id, patch){
    const idx = data.projects.findIndex(p=>p.id===id)
    if(idx===-1) return null
    const prev = data.projects[idx]
    const next = { ...prev, ...patch, updated: nowISO() }
    if(next.status && !ALLOWED_PROJECT_STATUS.has(next.status)) throw new Error(`Invalid status: ${next.status}`)
    if(next.status==='active' && !next.nextAction?.trim()) throw new Error('Active projects require a next action')
    data.projects[idx]=next
    const type = patch.status==='done' ? 'project_completed' : 'project_updated'
    logActivity(type,'project',id,{ changes: Object.keys(patch) })
    persist(); return next
  },
  deleteProject(id){
    data.projects = data.projects.filter(p=>p.id!==id)
    logActivity('project_deleted','project',id,{})
    persist()
  },
  addMemory(m){
    if(m.type && !ALLOWED_MEMORY_TYPES.has(m.type)) throw new Error(`Invalid memory type: ${m.type}`)
    const mem={ id:uid(), created: nowISO(), type: m.type||'knowledge', content: m.content, tags: m.tags||[], linkedProject: m.linkedProject||null, title: m.title||'', archived: false }
    data.memories.unshift(mem)
    logActivity('memory_created','memory',mem.id,{ linkedProject: mem.linkedProject })
    persist(); return mem
  },
  updateMemory(id, patch){
    const idx=data.memories.findIndex(m=>m.id===id)
    if(idx===-1) return null
    data.memories[idx]={ ...data.memories[idx], ...patch }
    persist(); return data.memories[idx]
  },
  deleteMemory(id){
    data.memories = data.memories.filter(m=>m.id!==id)
    persist()
  },
  addDecision(d){
    if(d.status && !ALLOWED_DECISION_STATUS.has(d.status)) throw new Error(`Invalid decision status: ${d.status}`)
    const dec={ id:uid(), created: nowISO(), status:'pending', confidence: d.confidence??60, assumptions: d.assumptions||[], evidence: d.evidence||[], expectedOutcome: d.expectedOutcome||'', outcome:'', reviewDate: d.reviewDate||null, linkedProject: d.linkedProject||null, ...d }
    data.decisions.unshift(dec)
    logActivity('decision_created','decision',dec.id,{ linkedProject: dec.linkedProject })
    persist(); return dec
  },
  updateDecision(id,patch){
    const i=data.decisions.findIndex(d=>d.id===id); if(i===-1) return null
    if(patch.status && !ALLOWED_DECISION_STATUS.has(patch.status)) throw new Error(`Invalid status: ${patch.status}`)
    const prevStatus = data.decisions[i].status
    data.decisions[i]={...data.decisions[i], ...patch}
    if(patch.status && patch.status!==prevStatus) logActivity('decision_reviewed','decision',id,{ from: prevStatus, to: patch.status })
    persist(); return data.decisions[i]
  },
  deleteDecision(id){
    data.decisions = data.decisions.filter(d=>d.id!==id)
    persist()
  },
  addIdea(i){
    if(i.status && !ALLOWED_IDEA_STATUS.has(i.status)) throw new Error(`Invalid idea status: ${i.status}`)
    const idea={ id:uid(), created: nowISO(), status:'captured', title:i.title, description:i.description||'', scores: i.scores||{novelty:3, feasibility:3, impact:3, alignment:3}, tags:i.tags||[], linkedProjectId: i.linkedProjectId||null }
    idea.total = calcIdeaScore(idea.scores)
    data.ideas.unshift(idea)
    logActivity('idea_captured','idea',idea.id,{})
    persist(); return idea
  },
  scoreIdea(id, scores){
    const it=data.ideas.find(x=>x.id===id); if(!it) return null
    it.scores={...it.scores, ...scores}; it.total=calcIdeaScore(it.scores); persist(); return it
  },
  promoteIdea(id, projectId=null){
    const idea=data.ideas.find(x=>x.id===id); if(!idea) throw new Error('Idea not found')
    if(idea.total < 10) throw new Error('Idea score too low to promote (need ≥10/20). Refine first.')
    idea.status='promoted'
    if(projectId) idea.linkedProjectId = projectId
    logActivity('idea_promoted','idea',id,{ linkedProjectId: projectId })
    persist(); return idea
  },
  addSession(s){
    const sess={ id:uid(), created: nowISO(), type: s.type||'focus', ...s }
    data.sessions.unshift(sess)
    logActivity('focus_session','session',sess.id,{ projectId: s.projectId, actualMins: s.actualMins||s.mins })
    persist(); return sess
  },
  logActivity(type, entityType, entityId, meta){ logActivity(type, entityType, entityId, meta); persist() }
}

function calcIdeaScore(s){
  const w = s.impact*1.2 + s.feasibility*1.0 + s.alignment*1.0 + s.novelty*0.8
  return Math.round(w*10)/10
}

let persistErrorTimer = null
function showPersistError(msg){
  lastPersistError = msg
  let el = document.getElementById('persistError')
  if(!el){
    el = document.createElement('div')
    el.id = 'persistError'
    el.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);background:#FF4A4A;color:white;padding:10px 16px;border-radius:10px;font-size:13px;z-index:9999;max-width:90vw;box-shadow:0 4px 20px rgba(0,0,0,0.3)'
    document.body?.appendChild(el)
  }
  el.textContent = msg
  el.style.display = 'block'
  clearTimeout(persistErrorTimer)
  persistErrorTimer = setTimeout(()=>{ if(el) el.style.display='none' }, 6000)
  try{ window.dispatchEvent(new CustomEvent('tao:persist-error', { detail: msg })) }catch{}
}

function persist(){
  try{
    const serialized = JSON.stringify(data)
    localStorage.setItem(KEY, serialized)
    lastPersistError = null
    const el = document.getElementById('persistError')
    if(el) el.style.display='none'
  }catch(e){
    const isQuota = e && (e.name === 'QuotaExceededError' || e.code === 22 || /quota/i.test(e.message||''))
    const msg = isQuota
      ? 'Storage full (QuotaExceededError). Free space or export and clear old data — your change was not saved.'
      : `Storage failed: ${e.message || e} — your change was not saved.`
    console.error('[TAO] persist failed', e)
    showPersistError(msg)
    throw e
  }
  try{ listeners.forEach(fn=>fn(data)) }catch(e){ console.error(e) }
}

export { uid, nowISO, todayISO, calcIdeaScore }
