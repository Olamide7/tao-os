import { store } from './store.js'

export const routes = [
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

export let current = localStorage.getItem('tao.route') || 'command'
if(current==='project') current = localStorage.getItem('tao.route')?.startsWith('project/') ? 'project' : 'command'

export function getCurrent(){ return current }
export function setCurrent(id){ current=id }

export function go(id, render, renderNav){
  if(id.startsWith('project/')){
    const pid=id.split('/')[1]
    localStorage.setItem('tao.activeProject', pid)
    current='project'
  } else {
    current=id
  }
  localStorage.setItem('tao.route', id.startsWith('project/') ? id : current)
  if(renderNav) renderNav()
  if(render) render()
  if(window.innerWidth<768){
    const sb=document.getElementById('sidebar')
    const bd=document.getElementById('sidebarBackdrop')
    if(sb) sb.classList.add('hidden')
    if(bd) bd.classList.add('hidden')
  }
}

export function navHTML(current){
  const groups = {}
  routes.forEach(r=>{ (groups[r.group] ||= []).push(r) })
  return Object.entries(groups).map(([g, items])=>`
    <div>
      <div class="text-[11px] tracking-[0.14em] text-tao-muted uppercase px-2 mb-2">${g}</div>
      <div class="space-y-1">
        ${items.map(r=>`
          <button data-route="${r.id}" aria-label="${r.label}" class="w-full flex items-center gap-3 px-3 h-9 rounded-xl text-sm text-left border ${current===r.id? 'bg-white text-black border-white font-medium' : 'bg-tao-card border-tao-border text-zinc-300 hover:border-zinc-700'}">
            <span class="w-6 text-center text-xs" aria-hidden="true">${r.icon}</span>
            <span class="flex-1">${r.label}</span>
            <span class="kbd ${current===r.id? '!text-zinc-600 !bg-zinc-100 !border-zinc-300' : ''}" aria-hidden="true">${r.k}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `).join('')
}
