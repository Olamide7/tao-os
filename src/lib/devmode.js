// Developer Mode — reconstruct where development stopped
// Tries to use File System Access API if available, otherwise works as manual tracker

export async function pickRepoDirectory(){
  if(!window.showDirectoryPicker){
    throw new Error('File System Access not supported in this browser. Use manual entry or Chrome/Edge desktop.')
  }
  const dir = await window.showDirectoryPicker({ mode: 'read' })
  return dir
}

export async function scanDirectory(dirHandle){
  // naive recursive scan for .git, package.json, TODOs, recent files
  const findings = { name: dirHandle.name, hasGit:false, files:[], todos:[], recent:[] }
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
  return findings
}

export function mockDevSnapshot(){
  return {
    name: 'tao-os',
    hasGit: true,
    files: ['src/main.js','src/lib/store.js','src/lib/planning.js','index.html','README.md'],
    todos: [{ file:'src/lib/store.js', count:2, lines:['// TODO: migrate to OPFS','// FIXME: handle corrupted JSON'] }],
    recent: [
      { file:'src/main.js', modified: Date.now()-1000*60*20, size: 12400 },
      { file:'index.html', modified: Date.now()-1000*60*60*3, size: 8200 },
    ],
    commits: [
      { hash:'a1b2c3d', msg:'feat: add planning engine', ago:'2h ago', author:'you' },
      { hash:'9f8e7d6', msg:'fix: enforce nextAction', ago:'5h ago', author:'you' },
      { hash:'4c3b2a1', msg:'chore: seed projects', ago:'1d ago', author:'you' },
    ],
    branch: 'main', dirty: true
  }
}
