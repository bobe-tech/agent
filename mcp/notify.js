#!/usr/bin/env node
// Post-run notifier: reads the DB and sends a clear English summary to Telegram.
// Deterministic — does not depend on the LLM's "memory". Two branches: tick (default) and reflection (REFLECTION=1).
// Env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, DB_*, PAIR, REFLECTION.
import { createPool } from '../core/db.js';

const n = (v, d = 2) => (v === null || v === undefined ? '—' : Number(v).toFixed(d));

// The model sometimes escapes characters in reason (&lt; &amp; ...), "playing it safe for the message".
// We send plain text (no parse_mode), so we decode them back into normal characters. &amp; — last.
const decodeEntities = (s) => String(s)
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
  .replace(/&amp;/g, '&');
const regimeLabel = (r) => ({ UP_TREND: 'uptrend', DOWN_TREND: 'downtrend', RANGE: 'range', LOWVOL: 'low volatility' }[r] || r);

function actionLabel(action) {
  return ({
    OPEN_LONG: '🟢 Opened LONG (betting on a rise)',
    OPEN_SHORT: '🔻 Opened SHORT (betting on a fall)',
    ADD: '➕ Averaged into the position (DCA ladder)',
    CLOSE: '✅ Closed the position',
    HOLD: '⏸ Decided to wait',
  }[action] || `Action: ${action}`);
}

// Unrealized PnL of an open position if closed NOW: from the LIVE price for the side
// (LONG → sell at bid; SHORT → buy back at ask). Gross without deducting rt — the spread is already in the prices.
// Fallback to the H1 bar close if there's no live price in the tick (old ticks / quote failure).
function unrealizedPct(p, tick) {
  const avg = Number(p.opened_price);
  if (!avg) return null;                       // a position with no fills (opened_price NULL) — no average price yet
  const liveMark = p.side === 'LONG' ? tick?.live_bid : tick?.live_ask;
  const mark = liveMark ?? tick?.close;
  if (mark == null) return null;
  const gross = p.side === 'LONG' ? (Number(mark) - avg) / avg * 100 : (avg - Number(mark)) / avg * 100;
  return { pct: gross, from_live: liveMark != null };
}

/** Pure: tick summary. Exported for tests. */
export function buildMessage({ tick, positions = [], closed = [], pair }) {
  const lines = [`🤖 ${pair}`, ''];
  if (!tick) {
    // No fresh tick_log row — the agent didn't finish writing the tick (error/timeout). Don't invent an "action".
    lines.push('⚠️ Tick not recorded in the log (no fresh decision).');
  } else {
    lines.push(actionLabel(tick.action));
    if (tick.reason) { lines.push(''); lines.push(tick.reason); }
    const parts = [];
    // Price: live (mid of live bid/ask) if available; otherwise the H1 bar close.
    const liveMid = (tick.live_bid != null && tick.live_ask != null)
      ? (Number(tick.live_bid) + Number(tick.live_ask)) / 2 : null;
    if (liveMid != null) parts.push(`price ${n(liveMid)}$ (live)`);
    else if (tick.close != null) parts.push(`price ${n(tick.close)}$`);
    if (tick.regime) parts.push(`regime: ${regimeLabel(tick.regime)}`);
    if (tick.atr_pct != null) parts.push(`volatility ${n(tick.atr_pct, 2)}%`);
    if (tick.adx != null) parts.push(`ADX ${n(tick.adx, 1)}`);
    if (parts.length) { lines.push(''); lines.push('📊 ' + parts.join(' · ')); }
  }

  // Positions closed within the window — result + reason
  for (const c of closed) {
    const pnl = Number(c.realized_pnl_pct);
    lines.push('');
    lines.push(`${pnl >= 0 ? '📈' : '📉'} Result: ${pnl >= 0 ? '+' : ''}${n(pnl)}% (${n(c.realized_pnl_usd)} USDT)`);
    if (c.reason) lines.push(`   exit reason: ${c.reason}`);
    // Special flags (deterministically from positions columns — independent of the agent's reason text).
    if (c.force_closed) lines.push('   ⚠️ forced close (hackathon finish / liquidation)');
  }

  // Open positions
  lines.push('');
  if (positions.length) {
    for (const p of positions) {
      const dir = p.side === 'LONG' ? 'LONG' : 'SHORT';
      lines.push(`💼 Open ${dir}: ${n(p.opened_amount, 0)} USDT, average ${n(p.opened_price)}$`);
      const u = unrealizedPct(p, tick);
      if (u != null) lines.push(`   unrealized PnL: ${u.pct >= 0 ? '+' : ''}${n(u.pct)}% (if closed now${u.from_live ? '' : ' — from the H1 close'})`);
    }
  } else {
    lines.push('💼 No open positions');
  }

  if (tick?.num_turns || tick?.cost_usd) {
    const bits = [];
    if (tick.num_turns) bits.push(`${tick.num_turns} steps`);
    if (tick.cost_usd) bits.push(`~$${Number(tick.cost_usd).toFixed(3)}`);
    lines.push('');
    lines.push(`⚙️ ${bits.join(' · ')}`);
  }
  return decodeEntities(lines.join('\n'));
}

/** Pure: reflection-job summary for Telegram — shows the agent's ANALYSIS (from reflection_log)
 *  + proposed inactive params versions. Exported for tests. */
export function buildReflectionMessage({ summary, proposals = [], pair }) {
  const lines = [`🤖 ${pair} · self-learning`, ''];
  lines.push(summary && String(summary).trim()
    ? String(summary).trim()
    : 'Reflection left no summary for the last run (no data or an error).');
  if (proposals.length) {
    lines.push('');
    lines.push('🔧 Proposed INACTIVE versions (a human activates them):');
    for (const p of proposals) lines.push(`• v${p.version}: ${p.reason || 'no description'}`);
  }
  return decodeEntities(lines.join('\n').trim());
}

/** Pure: alert that a position transitioned to error (the swap amounts couldn't be read from the blockchain). */
export function buildErrorAlert({ env, pair, position_id, order_id, tx_id, reason }) {
  return [
    `🚨 [${env || '?'}] Position #${position_id} (${pair}) → ERROR`,
    'Failed to obtain the swap amounts from the blockchain.',
    `Order #${order_id}, tx: ${tx_id}`,
    `Reason: ${reason || '—'}`,
  ].join('\n');
}

/** Pure: whether to send the tick to Telegram. Noise suppression — a tick with no action (HOLD and nothing closed)
 *  is NOT sent. We send if: there was an action (action≠HOLD) OR something closed within the window OR the tick wasn't recorded
 *  (an agent failure is a signal, not routine silence). Exported for tests. */
export function shouldNotifyTick({ tick, closed = [] }) {
  if (!tick) return true;                                         // no tick record — agent failure, alert
  if (Array.isArray(closed) && closed.length > 0) return true;    // something closed within the window
  return tick.action != null && tick.action !== 'HOLD';           // a real open/add/close action
}

export async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.log('[notify] TELEGRAM not configured — preview:\n' + text);
    return false;
  }
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), 10000);   // timeout so a hung Telegram API doesn't hang the process
  let res;
  try {
    res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      signal: ctrl.signal,
    });
  } catch (e) {
    console.error('[notify] telegram fetch failed', e.message);
    return false;
  } finally {
    clearTimeout(id);
  }
  if (!res.ok) {
    console.error('[notify] telegram error', res.status, await res.text());
    return false;
  }
  console.log('[notify] sent');
  return true;
}

async function main() {
  const pool = createPool();
  const pair = process.env.PAIR || 'ETH/USDT';
  const isReflection = process.env.REFLECTION === '1';
  try {
    if (isReflection) {
      const { rows: refl } = await pool.query(
        `SELECT summary FROM reflection_log WHERE pair=$1 AND ts > now() - interval '3 hours'
           ORDER BY id DESC LIMIT 1`, [pair]);
      const { rows: proposals } = await pool.query(
        `SELECT version, reason FROM params
           WHERE pair=$1 AND source='reflection' AND is_active=false AND created_at > now() - interval '3 hours'
           ORDER BY version DESC`, [pair]);
      await sendTelegram(buildReflectionMessage({ summary: refl[0]?.summary, proposals, pair }));
    } else {
      const { rows: ticks } = await pool.query(
        `SELECT * FROM tick_log WHERE pair=$1 AND ts > now() - interval '5 minutes' ORDER BY id DESC LIMIT 1`, [pair]);
      const { rows: positions } = await pool.query(
        `SELECT * FROM positions WHERE pair=$1 AND status='active' ORDER BY id DESC`, [pair]);
      const { rows: closed } = await pool.query(
        `SELECT * FROM positions WHERE pair=$1 AND status='completed' AND status_at > now() - interval '5 minutes' ORDER BY id DESC`, [pair]);
      const tick = ticks[0];
      // Noise suppression: a HOLD tick with no actions is NOT sent to Telegram (only trades + failures + reflection).
      // TELEGRAM_NOTIFY_HOLD=1 — send all ticks (debug/verbose mode).
      if (process.env.TELEGRAM_NOTIFY_HOLD === '1' || shouldNotifyTick({ tick, closed })) {
        await sendTelegram(buildMessage({ tick, positions, closed, pair }));
      } else {
        console.log(`[notify] ${pair}: HOLD with no actions — skipping Telegram`);
      }
    }
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('[notify] failed', e.message); process.exitCode = 1; });
}
