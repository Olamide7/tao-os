// TAO AI Provider abstraction — swappable
// Interface: generate({ prompt, context, system }) => Promise<string>

export const providers = {
  mock: {
    label: 'Mock (offline, heuristic)',
    generate: async ({ prompt, context }) => {
      await sleep(400)
      // heuristic intelligence without network
      const ctx = JSON.stringify(context).slice(0, 6000)
      return `**TAO (offline heuristic)**\n\nYou asked: _${prompt}_\n\nBased on your local memory (${context.projects?.length||0} projects, ${context.decisions?.length||0} decisions, ${context.ideas?.length||0} ideas), here's operational guidance:\n\n- **Do next:** Work on the highest-leverage project with a clear next action and nearest deadline. Check Command Center → Planning Engine.\n- **Reduce ambiguity:** Any active project without a next physical action is blocked — add one now (e.g., "Draft 200-word proposal", "Open VS Code and write failing test").\n- **Avoid proliferation:** You have ${context.ideas?.filter(i=>i.status==='captured').length||0} captured ideas. Score them, promote only ≥10/20.\n- **Evidence:** Use Decision Journal to log assumptions before you act, then revisit in 7 days.\n\n> Local context hash: ${hash(ctx).toString(16).slice(0,6)} — no data left your device.`
    }
  },
  grok: {
    label: 'Grok (xAI)',
    generate: async ({ prompt, context, apiKey }) => {
      if(!apiKey) throw new Error('Missing Grok API key')
      const res = await fetch('https://api.x.ai/v1/chat/completions',{
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'grok-3-mini',
          messages: [
            { role:'system', content: systemPrompt(context) },
            { role:'user', content: prompt }
          ],
          temperature: 0.4
        })
      })
      if(!res.ok) throw new Error(`Grok error ${res.status}: ${await res.text()}`)
      const j = await res.json()
      return j.choices?.[0]?.message?.content || '(empty)'
    }
  },
  openai: {
    label: 'OpenAI',
    generate: async ({ prompt, context, apiKey }) => {
      if(!apiKey) throw new Error('Missing OpenAI API key')
      const res = await fetch('https://api.openai.com/v1/chat/completions',{
        method:'POST',
        headers:{ 'Content-Type':'application/json','Authorization':`Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages:[
            {role:'system', content: systemPrompt(context)},
            {role:'user', content: prompt}
          ]
        })
      })
      if(!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`)
      const j=await res.json()
      return j.choices?.[0]?.message?.content || '(empty)'
    }
  },
  anthropic: {
    label: 'Anthropic',
    generate: async ({ prompt, context, apiKey }) => {
      if(!apiKey) throw new Error('Missing Anthropic key')
      const res = await fetch('https://api.anthropic.com/v1/messages',{
        method:'POST',
        headers:{ 'Content-Type':'application/json','x-api-key':apiKey, 'anthropic-version':'2023-06-01' },
        body: JSON.stringify({
          model:'claude-3-5-haiku-latest',
          system: systemPrompt(context),
          messages:[{role:'user', content: prompt}],
          max_tokens: 1200
        })
      })
      if(!res.ok) throw new Error(`Anthropic error ${res.status}: ${await res.text()}`)
      const j=await res.json()
      return j.content?.[0]?.text || '(empty)'
    }
  },
  ollama: {
    label: 'Ollama (local)',
    generate: async ({ prompt, context, apiKey }) => {
      const base = apiKey || 'http://localhost:11434'
      const res = await fetch(`${base.replace(/\/$/,'')}/api/chat`,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          model: 'llama3.1',
          messages:[
            {role:'system', content: systemPrompt(context)},
            {role:'user', content: prompt}
          ],
          stream:false
        })
      })
      if(!res.ok) throw new Error(`Ollama error ${res.status}: ${await res.text()}`)
      const j=await res.json()
      return j.message?.content || j.response || '(empty)'
    }
  }
}

function systemPrompt(context){
  return `You are TAO — a Personal Operating System for a Nigerian university student who is also a software developer and entrepreneur.
Your job is operational intelligence, NOT generic productivity advice.

Central principle: Every active project must have one clearly defined next physical action. Aggressively reduce ambiguity, context switching, and unnecessary project proliferation.

You have access to local memory:
${JSON.stringify(context, null, 2).slice(0, 8000)}

Rules:
- Be concise, concrete, and Nigerian-context aware (NEPA, data costs, ASUU, mobile-first, Naira constraints).
- Always give a single next physical action per project.
- Score ideas, don't auto-promote them.
- When uncertain, ask for evidence and log to Decision Journal.
- Never hallucinate files or repos not in context.`
}

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)) }
function hash(s){ let h=0; for(let i=0;i<s.length;i++) h=(h*31 + s.charCodeAt(i))>>>0; return h }

export async function generateWithProvider(providerKey, apiKey, prompt, context){
  const p = providers[providerKey] || providers.mock
  return p.generate({ prompt, context, apiKey })
}
