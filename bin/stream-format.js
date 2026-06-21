#!/usr/bin/env node
// Pretty-prints stream-json events from Claude Code (for ./start-pair.sh --dev).
// Distinguishes the main agent from subagents by parent_tool_use_id (in case
// subagents appear; in v2 the tick agent is monolithic — everything will be [main]).
import readline from 'node:readline';

const rl = readline.createInterface({ input: process.stdin });
const agents = {}; // Agent call id -> subagent name (subagent_type)
const short = (s, n = 200) => String(s).replace(/\s+/g, ' ').trim().slice(0, n);

// Who authored the event: no parent → the main agent; has one → the corresponding subagent.
const who = (ev) => (ev.parent_tool_use_id ? agents[ev.parent_tool_use_id] || 'subagent' : 'main');

rl.on('line', (line) => {
  if (!line.trim()) return;
  let ev;
  try { ev = JSON.parse(line); } catch { return; }

  if (ev.type === 'system' && ev.subtype === 'init') {
    console.log(`⚙️  session ${ev.session_id?.slice(0, 8)} · model ${ev.model}`);
  } else if (ev.type === 'assistant' && ev.message?.content) {
    const tag = who(ev);
    for (const c of ev.message.content) {
      if (c.type === 'text' && c.text.trim()) {
        console.log(`\n💬 [${tag}] ${c.text.trim()}`);
      } else if (c.type === 'tool_use') {
        if (c.name === 'Agent') {
          agents[c.id] = c.input?.subagent_type || 'subagent';
          console.log(`\n🤖 [${tag}] launches a subagent → ${agents[c.id]}`);
        } else {
          console.log(`🔧 [${tag}] ${c.name}(${short(JSON.stringify(c.input))})`);
        }
      }
    }
  } else if (ev.type === 'user' && ev.message?.content) {
    const tag = who(ev);
    for (const c of ev.message.content) {
      if (c.type === 'tool_result') {
        const t = Array.isArray(c.content) ? c.content.map((x) => x.text || '').join('') : c.content || '';
        console.log(`   ↳ [${tag}] ${short(t, 180)}`);
      }
    }
  } else if (ev.type === 'result') {
    console.log(`\n✅ done — ${ev.duration_ms}ms · ${ev.num_turns} turns · $${ev.total_cost_usd ?? '?'}`);
  }
});
