// Planning Engine — recommends what to work on next given time, deadlines, importance, effort, blockers
import { todayISO } from './store.js'

export function scoreProject(p, availableMinutes){
  // returns 0-100
  let s = 0
  // strategic importance 1-5 => 0-30
  s += (p.strategicImportance||3)*6
  // urgency: days until deadline
  if(p.deadline){
    const days = (new Date(p.deadline) - new Date())/86400000
    if(days < 0) s += 35 // overdue
    else if(days < 2) s += 30
    else if(days < 7) s += 22
    else if(days < 14) s += 12
    else s += 4
  } else {
    s += 6
  }
  // effort fit
  const effortMap = { S: 10, M: 20, L: 45, XL: 90 }
  const mins = effortMap[p.effort||'M']
  if(availableMinutes){
    if(mins <= availableMinutes) s += 12
    else if(mins <= availableMinutes*1.5) s += 6
    else s -= 8
  }
  // blocker penalty
  if(p.blockers?.length) s -= 12 + p.blockers.length*4
  // progress bonus for near-complete (finish what you start)
  if((p.progress||0) > 70) s += 8
  // dependency penalty (if dependencies not done — simplified: if any dependency string, mild penalty)
  if(p.dependencies?.length) s -= 5
  // no nextAction => -100 (shouldn't happen due to enforcement, but handle)
  if(!p.nextAction?.trim()) s -= 100

  return Math.max(0, Math.min(100, Math.round(s)))
}

export function recommend(data, availableMinutes=120){
  const active = data.projects.filter(p=>p.status==='active')
  const scored = active.map(p=>({ p, score: scoreProject(p, availableMinutes) }))
    .sort((a,b)=> b.score - a.score)
  return scored
}

export function weeklyAnalysis(data){
  const projects = data.projects
  const active = projects.filter(p=>p.status==='active')
  const done = projects.filter(p=>p.status==='done')
  const paused = projects.filter(p=>p.status==='paused')
  const overdue = active.filter(p=> p.deadline && new Date(p.deadline) < new Date())
  const blocked = active.filter(p=> p.blockers?.length)
  const noAction = active.filter(p=> !p.nextAction?.trim())
  const stale = active.filter(p=> {
    const upd = new Date(p.updated||p.created)
    return (Date.now()-upd) > 7*86400000
  })
  // proliferation: many active vs done ratio
  const proliferation = active.length > 7 ? 'High — too many active projects (limit to 5-7)' : active.length>5 ? 'Moderate' : 'Healthy'
  // idea backlog
  const ideasCaptured = data.ideas.filter(i=>i.status==='captured').length
  // decision hygiene
  const pendingDecisions = data.decisions.filter(d=>d.status==='pending').length
  const validated = data.decisions.filter(d=>d.status==='validated').length

  // bottleneck detection
  const bottlenecks=[]
  if(overdue.length) bottlenecks.push(`${overdue.length} overdue project(s) — reschedule or drop scope`)
  if(blocked.length) bottlenecks.push(`${blocked.length} blocked — define unblock action or escalate`)
  if(stale.length) bottlenecks.push(`${stale.length} stale (>7d no update) — review or archive`)
  if(active.length>7) bottlenecks.push(`Context switching risk — ${active.length} active > 7. Pause lowest-importance.`)
  if(ideasCaptured>10) bottlenecks.push(`Idea debt — ${ideasCaptured} unscored ideas. Spend 10m scoring.`)
  if(pendingDecisions>5) bottlenecks.push(`${pendingDecisions} pending decisions — close loop or set review date`)

  return {
    totals: { active: active.length, done: done.length, paused: paused.length, overdue: overdue.length, blocked: blocked.length, stale: stale.length, proliferation, ideasCaptured, pendingDecisions, validated },
    bottlenecks,
    overdue, blocked, stale, noAction
  }
}
