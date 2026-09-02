// Developer Mode — reconstruct where development stopped
// Tries to use File System Access API if available, otherwise shows honest disconnected state.
// Never fabricates commits/TODOs as real data.

export async function pickRepoDirectory(){
  if(!window.showDirectoryPicker){
    throw new Error('File System Access not supported in this browser. Use manual entry or Chrome/Edge desktop.')
  }
  const dir = await window.showDirectoryPicker({ mode: 'read' })
  return dir
}

export async function scanDirectory(dirHandle){
  const findings = { name: dirHandle.name, hasGit:false, files:[], todos:[], recent:[], commits:[], branch: null, dirty: false, connected: true }
  async function walk(handle, path='', depth=0){
    if(depth>4) return
    for await (const [name, entry] of handle.entries()){
      if(name.startsWith('.git')){
        findings.hasGit=true
        continue
      }
      if(name==='node_modules' || name==='dist' || name==='.next' || name==='.venv') continue
      const full = path? `${path}/${name}`: name
      if(entry.kind==='file'){
        findings.files.push(full)
        if(full.match(/\.(js|ts|tsx|py|go|rs|md)$/)){
          try{
            const f = await entry.getFile()
            const text = await f.text()
            const todoMatches = [...text.matchAll(/TODO|FIXME|HACK/g)]
            if(todoMatches.length) findings.todos.push({ file: full, count: todoMatches.length, lines: text.split('\n').filter(l=>/TODO|FIXME|HACK/.test(l)).slice(0,5) })
            findings.recent.push({ file: full, modified: f.lastModified, size: f.size })
          }catch{}
        }
      } else if(entry.kind==='directory'){
        await walk(entry, full, depth+1)
      }
    }
  }
  await walk(dirHandle)
  findings.recent.sort((a,b)=>b.modified-a.modified)
  findings.recent = findings.recent.slice(0, 12)
  // Note: commits require git log; File System Access cannot read .git objects reliably, so we leave commits empty and show honest state
  findings.commits = []
  return findings
}

export function mockDevSnapshot(){
  // Honest disconnected state — no fabricated commits
  return {
    name: null,
    connected: false,
    hasGit: false,
    files: [],
    todos: [],
    recent: [],
    commits: [],
    branch: null,
    dirty: false
  }
}
