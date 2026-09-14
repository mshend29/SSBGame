'use client'

import { useEffect, useMemo, useState } from 'react'
import { getHostClient } from '../../lib/supabase'

export default function HostPage(){
  const [secret,setSecret]=useState('')
  const [codeDraft,setCodeDraft]=useState('')
  const [session,setSession]=useState(null)
  const [stats,setStats]=useState(null)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [busy,setBusy]=useState(false)
  const client=useMemo(()=>secret?getHostClient(secret):null,[secret])

  useEffect(()=>{ const s=sessionStorage.getItem('ssb-host-secret'); if(s)setSecret(s) },[])
  useEffect(()=>{ if(!client)return; load(); const t=setInterval(load,2000); return()=>clearInterval(t) },[client])
  useEffect(()=>{ if(session?.code)setCodeDraft(session.code) },[session?.code])

  async function load(){
    if(!client)return
    const {data:s,error:e}=await client.from('game_sessions')
      .select('id,code,title,stage,event_phase,current_event_order,starting_balance,created_at')
      .order('created_at',{ascending:false})
      .limit(1)
      .maybeSingle()
    if(e){setError(e.message);return}
    setSession(s||null)
    if(!s){setStats(null);return}

    const [{count:players},{count:budgeted},{data:events},{data:choices}]=await Promise.all([
      client.from('public_scores').select('player_id',{count:'exact',head:true}).eq('session_id',s.id),
      client.from('public_scores').select('player_id',{count:'exact',head:true}).eq('session_id',s.id).eq('budget_confirmed',true),
      client.from('game_events').select('id,event_order,title').eq('session_id',s.id).order('event_order'),
      s.current_event_order?client.from('event_choice_stats').select('choice_label,votes,event_order').eq('session_id',s.id).eq('event_order',s.current_event_order):Promise.resolve({data:[]})
    ])
    setStats({players:players||0,budgeted:budgeted||0,events:events||[],choices:choices||[]})
  }

  function saveSecret(v){setSecret(v);sessionStorage.setItem('ssb-host-secret',v)}

  async function update(patch){
    if(!client||!session)return
    setBusy(true);setError('');setNotice('')
    const {data,error:e}=await client.from('game_sessions').update(patch).eq('id',session.id).select('id')
    if(e)setError(e.message)
    else if(!data?.length)setError('Host secret tidak cocok atau sesi tidak dapat diubah.')
    await load(); setBusy(false)
  }

  async function startRoundOne(){
    const players=stats?.players||0
    const budgeted=stats?.budgeted||0
    if(players===0){setError('Belum ada peserta yang masuk.');return}
    if(budgeted<players){setError(`Belum semua peserta mengunci budget (${budgeted}/${players}).`);return}
    return update({stage:'game',event_phase:'voting',current_event_order:1})
  }

  async function nextEvent(){
    const max=stats?.events?.length||0; const current=session.current_event_order||0
    if(current>=max)return update({stage:'finished',event_phase:'idle'})
    return update({stage:'game',current_event_order:current+1,event_phase:'voting'})
  }

  async function saveSessionCode(){
    if(!client||!session)return
    const normalized=codeDraft.trim().toUpperCase()
    if(!/^[A-Z0-9]{4,12}$/.test(normalized)){
      setError('Kode sesi harus 4–12 karakter dan hanya boleh berisi huruf atau angka.')
      return
    }
    setBusy(true);setError('');setNotice('')
    const {data,error:e}=await client.from('game_sessions').update({code:normalized}).eq('id',session.id).select('code')
    if(e){setError(e.message);setBusy(false);return}
    if(!data?.length){setError('Host secret tidak cocok atau kode sesi tidak dapat diubah.');setBusy(false);return}
    const newCode=data[0].code
    setCodeDraft(newCode)
    setSession(prev=>prev?{...prev,code:newCode}:prev)
    setNotice(`Kode sesi berhasil diubah menjadi ${newCode}. QR pada layar presentasi akan mengikuti kode baru.`)
    setBusy(false)
  }

  async function resetSession(){
    if(!client||!session)return
    const ok=window.confirm(`Reset sesi ${session.code}? Semua mahasiswa, budget, jawaban ronde, leaderboard, dan vote akan dihapus. Konten ronde tetap disimpan.`)
    if(!ok)return
    setBusy(true);setError('');setNotice('')
    const {error:e}=await client.rpc('host_reset_session',{p_session_id:session.id})
    if(e){setError(e.message);setBusy(false);return}

    const {count:remaining,error:verifyError}=await client.from('public_scores')
      .select('player_id',{count:'exact',head:true})
      .eq('session_id',session.id)

    if(verifyError){
      setError(`Reset dijalankan, tetapi verifikasi gagal: ${verifyError.message}`)
    }else if((remaining||0)>0){
      setError(`Reset belum tuntas. Masih ada ${remaining} peserta tersimpan.`)
    }else{
      setNotice('Session berhasil di-reset. Semua data peserta dan jawaban sudah dibersihkan, dan sesi kembali ke lobby.')
    }
    await load()
    setBusy(false)
  }

  if(!secret)return <main className="shell"><div className="panel" style={{maxWidth:520,margin:'12vh auto 0'}}><span className="eyebrow">HOST ACCESS</span><h2>Masukkan host secret</h2><p>Secret hanya digunakan pada perangkat host dan disimpan di session browser.</p><div className="field"><input className="input" type="password" placeholder="Host secret" onKeyDown={e=>{if(e.key==='Enter')saveSecret(e.currentTarget.value)}} /></div><p className="tiny">Tekan Enter untuk masuk.</p></div></main>

  const allBudgeted=(stats?.players||0)>0 && (stats?.budgeted||0)===(stats?.players||0)

  return <main className="shell">
    <div className="topbar"><div className="brand"><span className="live-dot"/>Host Dashboard</div><span className="pill">{session?.code||'—'}</span></div>
    {error&&<div className="error">{error}</div>}
    {notice&&<div className="success">{notice}</div>}

    <div className="grid">
      <section className="panel span-8"><span className="eyebrow">SESSION CONTROL</span><h2>{session?.title||'Session not found'}</h2><p>Stage: <b>{session?.stage}</b> · Phase: <b>{session?.event_phase}</b> · Event: <b>{session?.current_event_order||'—'}</b></p>
        <div className="host-controls"><button className="btn btn-secondary" disabled={busy||!session} onClick={()=>update({stage:'budgeting',event_phase:'idle',current_event_order:null})}>1. Open Budgeting</button><button className="btn btn-primary" disabled={busy||!allBudgeted} onClick={startRoundOne}>2. Start Round 1</button><button className="btn btn-ghost" disabled={busy||session?.stage!=='game'} onClick={()=>update({event_phase:'reveal'})}>Reveal Consequence</button><button className="btn btn-primary" disabled={busy||session?.stage!=='game'} onClick={nextEvent}>Next Round →</button><button className="btn btn-danger" disabled={busy||!session} onClick={()=>update({stage:'finished',event_phase:'idle'})}>Finish Game</button><button className="btn btn-ghost" onClick={()=>{sessionStorage.removeItem('ssb-host-secret');setSecret('')}}>Lock Host</button></div>
        {!allBudgeted&&<p className="tiny" style={{marginTop:14}}>Round 1 baru dapat dimulai setelah semua peserta mengunci budget.</p>}
      </section>

      <aside className="panel span-4"><span className="eyebrow">LIVE PARTICIPANTS</span><div className="metric">{stats?.players||0}</div><p><b>{stats?.budgeted||0}/{stats?.players||0}</b> sudah mengunci budget.</p></aside>

      <section className="panel span-6">
        <span className="eyebrow">SESSION SETTINGS</span>
        <h2>Kode Join Mahasiswa</h2>
        <p>Kode ini dipakai mahasiswa saat masuk ke game. Gunakan 4–12 huruf/angka tanpa spasi.</p>
        <p className="tiny">Mengganti kode hanya mengganti akses join; data peserta lama tetap ada sampai kamu menekan Reset Session.</p>
        <div className="field"><label>Session code</label><input className="input" value={codeDraft} maxLength={12} onChange={e=>setCodeDraft(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,''))}/></div>
        <button className="btn btn-secondary" disabled={busy||!session||codeDraft===session?.code} onClick={saveSessionCode}>Save Session Code</button>
      </section>

      <section className="panel span-6">
        <span className="eyebrow">RESET SESSION</span>
        <h2>Mulai dari nol</h2>
        <p>Menghapus mahasiswa, budget, pilihan ronde, leaderboard, dan vote. Event, pilihan event, serta learning point tidak ikut terhapus.</p>
        <button className="btn btn-danger" disabled={busy||!session} onClick={resetSession}>Reset Semua Data Peserta</button>
      </section>

      <section className="panel span-12"><span className="eyebrow">CURRENT VOTE</span><div className="bars">{(stats?.choices||[]).length===0?<p>Belum ada vote pada event aktif.</p>:(stats.choices.map(c=>{const total=stats.choices.reduce((a,x)=>a+x.votes,0)||1;const pct=Math.round(c.votes/total*100);return <div className="bar-row" key={c.choice_label}><b>{c.choice_label}</b><div className="bar-track"><div className="bar-fill" style={{width:`${pct}%`}}/></div><span>{c.votes} · {pct}%</span></div>}))}</div></section>
    </div>
  </main>
}
