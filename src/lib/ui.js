export function escapeHTML(s){ return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;') }
export function fmtDate(d){
  if(!d) return '—'
  try{ return new Date(d).toLocaleDateString('en-NG', { month:'short', day:'numeric', year:'numeric'}) }catch{ return escapeHTML(d) }
}
export function daysLeft(d){
  if(!d) return null
  const diff = (new Date(d)-new Date())/86400000
  return Math.ceil(diff)
}
export function effortBadge(e){
  const m={S:'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', M:'bg-amber-500/20 text-amber-300 border-amber-500/30', L:'bg-orange-500/20 text-orange-300 border-orange-500/40', XL:'bg-red-500/20 text-red-300 border-red-500/40'}
  return `<span class="text-[11px] px-2 py-1 rounded-full border ${m[e]||m.M}">${escapeHTML(e)}</span>`
}
export function statusBadge(s){
  const m={active:'bg-white text-black', paused:'bg-zinc-800 text-zinc-300 border border-tao-border', done:'bg-emerald-500 text-black', archived:'bg-zinc-900 text-zinc-500'}
  return `<span class="text-[11px] px-2 py-1 rounded-full ${m[s]||m.active}">${escapeHTML(s)}</span>`
}
export function toast(msg){
  const t=document.createElement('div')
  t.textContent=msg
  t.className='fixed bottom-8 left-1/2 -translate-x-1/2 bg-white text-black text-sm px-4 py-2 rounded-full shadow-lg z-50'
  t.setAttribute('role','status')
  t.setAttribute('aria-live','polite')
  document.body.appendChild(t)
  setTimeout(()=> t.remove(), 2200)
}
export function formatMins(sec){ const m=Math.floor(sec/60), s=sec%60; return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` }
