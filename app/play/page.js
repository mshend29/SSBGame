'use client'

import { useEffect, useMemo, useState } from 'react'
import { budgetOptions, DEFAULT_SESSION_CODE, moneyPersonality, rupiah, smartScore } from '../../lib/game'
import { getPublicClient } from '../../lib/supabase'

const STORAGE_KEY = 'ssb-player-v1'

export default function PlayPage() {
  const [session, setSession] = useState(null)
  const [faculties, setFaculties] = useState([])
  const [player, setPlayer] = useState(null)
  const [event, setEvent] = useState(null)
  const [options, setOptions] = useState([])
  const [picked, setPicked] = useState(null)
  const [budget, setBudget] = useState({})
  const [form, setForm] = useState({ name: '', nim: '', faculty: '', code: DEFAULT_SESSION_CODE })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const publicClient = useMemo(() => getPublicClient(), [])
  const playerClient = useMemo(() => player?.access_token ? getPublicClient(player.access_token) : null, [player?.access_token])

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try { setPlayer(JSON.parse(saved)) } catch {}
    }
    const code = new URLSearchParams(window.location.search).get('code')
    if (code) setForm(v => ({ ...v, code: code.toUpperCase() }))
    loadPublic(code || DEFAULT_SESSION_CODE)
  }, [])

  useEffect(() => {
    if (!session?.id) return
    const channel = publicClient.channel(`session:${session.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_sessions', filter: `id=eq.${session.id}` }, payload => {
        setSession(payload.new)
      }).subscribe()
    return () => { publicClient.removeChannel(channel) }
  }, [session?.id])

  useEffect(() => {
    if (!playerClient || !player?.id) return
    refreshPlayer()
  }, [playerClient, session?.stage, session?.event_phase, session?.current_event_order])

  useEffect(() => {
    if (!session || session.stage !== 'game' || !session.current_event_order) { setEvent(null); setOptions([]); return }
    loadEvent(session.current_event_order)
  }, [session?.stage, session?.current_event_order, session?.event_phase])

  async function loadPublic(code) {
    setLoading(true); setError('')
    const [{ data: s, error: se }, { data: f }] = await Promise.all([
      publicClient.from('game_sessions').select('id,code,title,stage,event_phase,current_event_order,starting_balance').eq('code', code.toUpperCase()).maybeSingle(),
      publicClient.from('faculties').select('name').eq('is_active', true).order('name')
    ])
    if (se || !s) setError('Sesi game belum tersedia. Periksa kode sesi.')
    setSession(s || null); setFaculties(f || []); setLoading(false)
  }

  async function join(e) {
    e.preventDefault(); setError('')
    const name = form.name.trim(); const nim = form.nim.trim(); const faculty = form.faculty.trim()
    if (!name || !nim || !faculty || !session) return setError('Nama, NIM, dan fakultas wajib diisi.')
    const id = crypto.randomUUID(); const token = crypto.randomUUID()
    const { error: insertError } = await publicClient.from('players').insert({
      id, session_id: session.id, name, nim, faculty, access_token: token
    })
    if (insertError) {
      if (insertError.code === '23505') return setError('NIM ini sudah terdaftar pada sesi ini.')
      return setError(insertError.message)
    }
    const saved = { id, session_id: session.id, name, nim, faculty, access_token: token }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); setPlayer(saved)
  }

  async function refreshPlayer() {
    const { data, error: pe } = await playerClient.from('players')
      .select('id,name,nim,faculty,balance,finance,academic,social,wellbeing,budget_json,budget_total,budget_confirmed')
      .eq('id', player.id).maybeSingle()
    if (!pe && data) setPlayer(prev => ({ ...prev, ...data }))
  }

  async function loadEvent(order) {
    const { data: ev } = await publicClient.from('game_events')
      .select('id,event_order,title,kicker,description')
      .eq('session_id', session.id).eq('event_order', order).maybeSingle()
    if (!ev) return
    setEvent(ev); setPicked(null)
    const { data: opts } = await publicClient.from('event_choices')
      .select('id,label,description,balance_delta,finance_delta,academic_delta,social_delta,wellbeing_delta,reveal_text,choice_order')
      .eq('event_id', ev.id).order('choice_order')
    setOptions(opts || [])
    if (playerClient) {
      const { data: existing } = await playerClient.from('player_choices').select('choice_id').eq('player_id', player.id).eq('event_id', ev.id).maybeSingle()
      if (existing) setPicked(existing.choice_id)
    }
  }

  function chooseBudget(key, value) { setBudget(prev => ({ ...prev, [key]: value })) }
  const budgetTotal = Object.values(budget).reduce((a, b) => a + Number(b || 0), 0)
  const completeBudget = budgetOptions.every(item => budget[item.key])

  async function confirmBudget() {
    if (!completeBudget) return setError('Pilih nominal untuk semua kategori.')
    if (budgetTotal > session.starting_balance) return setError('Budget melebihi uang bulananmu.')
    setError('')
    const { error: be } = await playerClient.from('players').update({ budget_json: budget, budget_confirmed: true, last_seen_at: new Date().toISOString() }).eq('id', player.id)
    if (be) return setError(be.message)
    await refreshPlayer()
  }

  async function choose(choiceId) {
    if (!event || session.event_phase !== 'voting' || picked) return
    setError('')
    const { error: ce } = await playerClient.from('player_choices').insert({ player_id: player.id, event_id: event.id, choice_id: choiceId })
    if (ce) return setError(ce.message)
    setPicked(choiceId); await refreshPlayer()
  }

  function resetDevice() { localStorage.removeItem(STORAGE_KEY); location.reload() }

  if (loading) return <main className="shell"><div className="panel">Memuat sesi...</div></main>

  if (!player) return (
    <main className="shell">
      <div className="topbar"><div className="brand">💸 Smart Student Budget</div><span className="pill">JOIN GAME</span></div>
      <div className="grid">
        <section className="panel span-7"><span className="eyebrow">30 DAYS SURVIVAL</span><h1 style={{fontSize:'clamp(2.5rem,8vw,5rem)'}}>Uangmu.<br/>Pilihanmu.</h1><p>Masuk dengan identitas kampusmu. NIM hanya dipakai untuk mencegah peserta ganda dan tidak ditampilkan di leaderboard.</p></section>
        <form className="panel span-5" onSubmit={join}>
          <h2>Masuk ke game</h2>{error && <div className="error">{error}</div>}
          <div className="field"><label>Kode sesi</label><input className="input" value={form.code} onChange={e=>setForm({...form,code:e.target.value.toUpperCase()})} onBlur={()=>loadPublic(form.code)} /></div>
          <div className="field"><label>Nama / nickname</label><input className="input" maxLength={40} value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Nama yang tampil di leaderboard" /></div>
          <div className="field"><label>NIM</label><input className="input" maxLength={40} value={form.nim} onChange={e=>setForm({...form,nim:e.target.value})} placeholder="Nomor induk mahasiswa" /></div>
          <div className="field"><label>Fakultas</label><input className="input" list="faculty-list" maxLength={100} value={form.faculty} onChange={e=>setForm({...form,faculty:e.target.value})} placeholder="Contoh: Fakultas Teknik" /><datalist id="faculty-list">{faculties.map(f=><option key={f.name} value={f.name}/>)}</datalist></div>
          <button className="btn btn-primary full" disabled={!session}>Mulai Game →</button>
        </form>
      </div>
    </main>
  )

  if (!session) return <main className="shell"><div className="panel"><div className="error">Sesi tidak ditemukan.</div><button className="btn btn-ghost" onClick={resetDevice}>Masuk ulang</button></div></main>

  if (session.stage === 'lobby') return <Waiting title={`Hai, ${player.name}!`} text="Kamu sudah masuk. Tunggu host membuka sesi budgeting." player={player} />

  if (session.stage === 'budgeting' && !player.budget_confirmed) return (
    <main className="shell"><div className="topbar"><div className="brand">💸 Smart Student Budget</div><span className="pill">BUILD YOUR BUDGET</span></div>
      <div className="grid"><section className="panel span-7"><span className="eyebrow">SALDO AWAL</span><div className="money">{rupiah(session.starting_balance)}</div><p>Atur rencana pengeluaran 30 harimu. Tidak ada jawaban sempurna—setiap pilihan punya trade-off.</p>
        <div className="budget-list">{budgetOptions.map(item=><div className="budget-item" key={item.key}><div className="budget-title"><span>{item.icon} {item.label}</span><span>{budget[item.key]?rupiah(budget[item.key]):'—'}</span></div><div className="choice-grid">{item.options.map(value=><button type="button" key={value} className={`choice ${budget[item.key]===value?'active':''}`} onClick={()=>chooseBudget(item.key,value)}>{rupiah(value)}</button>)}</div></div>)}</div>
      </section><aside className="panel span-5"><span className="eyebrow">RENCANA BULANAN</span><div className="money" style={{fontSize:'2.6rem'}}>{rupiah(budgetTotal)}</div><p>Sisa setelah alokasi: <b style={{color:'white'}}>{rupiah(session.starting_balance-budgetTotal)}</b></p>{error&&<div className="error">{error}</div>}<button className="btn btn-primary full" disabled={!completeBudget||budgetTotal>session.starting_balance} onClick={confirmBudget}>Kunci Budget</button></aside></div>
    </main>
  )

  if (session.stage === 'budgeting' && player.budget_confirmed) return <Waiting title="Budget terkunci 🔒" text="Sekarang tunggu semua peserta selesai. Game akan dimulai dari layar host." player={player} />

  if (session.stage === 'game' && event) {
    const selected = options.find(o=>o.id===picked)
    return <main className="shell"><div className="topbar"><div className="brand">💸 Smart Student Budget</div><span className="pill">ROUND {event.event_order}</span></div>
      <div className="grid"><section className="event-card span-8"><div className="event-kicker">{event.kicker}</div><h1 style={{fontSize:'clamp(2.2rem,7vw,4.6rem)',marginTop:8}}>{event.title}</h1><p>{event.description}</p>
        <div className="event-options">{options.map(o=><button key={o.id} className="event-option" disabled={!!picked||session.event_phase!=='voting'} onClick={()=>choose(o.id)}><strong>{o.label}</strong><small>{o.description}</small></button>)}</div>
        {picked && session.event_phase==='voting' && <div className="success" style={{marginTop:16}}>Pilihanmu sudah terkunci. Tunggu reveal dari host.</div>}
        {picked && session.event_phase==='reveal' && selected && <div className="panel" style={{marginTop:16,padding:18}}><span className="eyebrow">CONSEQUENCE</span><h3>{selected.reveal_text}</h3><p>Saldo: {selected.balance_delta>=0?'+':''}{rupiah(selected.balance_delta)} · Finance {signed(selected.finance_delta)} · Academic {signed(selected.academic_delta)} · Social {signed(selected.social_delta)} · Wellbeing {signed(selected.wellbeing_delta)}</p></div>}
      </section><aside className="panel span-4"><span className="eyebrow">YOUR STATUS</span><div className="money" style={{fontSize:'2.5rem'}}>{rupiah(player.balance)}</div><ScoreRow player={player}/>{error&&<div className="error" style={{marginTop:16}}>{error}</div>}</aside></div>
    </main>
  }

  if (session.stage === 'finished') {
    const personality = moneyPersonality(player); const score = smartScore(player)
    return <main className="shell"><div className="topbar"><div className="brand">💸 Smart Student Budget</div><span className="pill">30 DAYS COMPLETE</span></div><div className="grid"><section className="panel span-7"><span className="eyebrow">YOUR STUDENT MONEY REPORT</span><h1 style={{fontSize:'clamp(2.3rem,7vw,4.8rem)'}}>{personality.title}</h1><p>{personality.text}</p><div className="money">{score}/100</div><p>Smart Student Score</p></section><aside className="panel span-5"><h2>{player.name}</h2><p>{player.faculty}</p><span className="eyebrow">ENDING BALANCE</span><div className="money" style={{fontSize:'2.5rem'}}>{rupiah(player.balance)}</div><ScoreRow player={player}/></aside></div></main>
  }

  return <Waiting title="Game sedang disiapkan" text="Tetap di halaman ini. Perubahan ronde akan muncul otomatis." player={player} />
}

function Waiting({title,text,player}) { return <main className="shell"><div className="panel center" style={{maxWidth:680,margin:'12vh auto 0'}}><span className="eyebrow">YOU'RE IN</span><h1 style={{fontSize:'clamp(2.4rem,8vw,4.8rem)'}}>{title}</h1><p>{text}</p>{player?.balance!=null&&<><div className="money" style={{fontSize:'2.5rem'}}>{rupiah(player.balance)}</div><ScoreRow player={player}/></>}</div></main> }
function ScoreRow({player}) { return <div className="score-row" style={{marginTop:16}}>{[['Finance',player.finance],['Academic',player.academic],['Social',player.social],['Wellbeing',player.wellbeing]].map(([k,v])=><div className="score-card" key={k}><b>{v}</b><span>{k}</span></div>)}</div> }
function signed(v){ return v>0?`+${v}`:`${v}` }
