'use client'

import { useEffect, useMemo, useState } from 'react'
import { getHostClient } from '../../lib/supabase'

const blankChoice = (label='') => ({
  label,
  description:'',
  balance_delta:0,
  finance_delta:0,
  academic_delta:0,
  social_delta:0,
  wellbeing_delta:0,
  reveal_text:''
})

export default function HostPage(){
  const [secret,setSecret]=useState('')
  const [codeDraft,setCodeDraft]=useState('')
  const [session,setSession]=useState(null)
  const [stats,setStats]=useState(null)
  const [rounds,setRounds]=useState([])
  const [editor,setEditor]=useState(null)
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
    if(!s){setStats(null);setRounds([]);return}

    const [{count:players},{count:budgeted},{data:events,error:eventError},{data:voteChoices}]=await Promise.all([
      client.from('public_scores').select('player_id',{count:'exact',head:true}).eq('session_id',s.id),
      client.from('public_scores').select('player_id',{count:'exact',head:true}).eq('session_id',s.id).eq('budget_confirmed',true),
      client.from('game_events').select('id,event_order,kicker,title,description,learning_point').eq('session_id',s.id).order('event_order'),
      s.current_event_order?client.from('event_choice_stats').select('choice_label,votes,event_order').eq('session_id',s.id).eq('event_order',s.current_event_order):Promise.resolve({data:[]})
    ])
    if(eventError){setError(eventError.message);return}

    let choiceRows=[]
    if(events?.length){
      const {data,error:choiceError}=await client.from('event_choices')
        .select('id,event_id,choice_order,label,description,balance_delta,finance_delta,academic_delta,social_delta,wellbeing_delta,reveal_text')
        .in('event_id',events.map(ev=>ev.id))
        .order('choice_order')
      if(choiceError){setError(choiceError.message);return}
      choiceRows=data||[]
    }

    const fullRounds=(events||[]).map(ev=>({
      ...ev,
      choices:choiceRows.filter(c=>c.event_id===ev.id).sort((a,b)=>a.choice_order-b.choice_order)
    }))
    setRounds(fullRounds)
    setStats({players:players||0,budgeted:budgeted||0,events:fullRounds,choices:voteChoices||[]})
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
    if((stats?.events?.length||0)===0){setError('Belum ada round. Tambahkan minimal satu round terlebih dahulu.');return}
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

  function openNewRound(){
    setEditor({
      id:null,
      kicker:'NEW CHALLENGE',
      title:'',
      description:'',
      learning_point:'',
      choices:[blankChoice('Pilihan A'),blankChoice('Pilihan B'),blankChoice('Pilihan C')]
    })
  }

  function openEditRound(round){
    setEditor({
      id:round.id,
      kicker:round.kicker,
      title:round.title,
      description:round.description,
      learning_point:round.learning_point||'',
      choices:round.choices.map(c=>({...c}))
    })
  }

  function updateChoice(index,key,value){
    setEditor(prev=>({...prev,choices:prev.choices.map((c,i)=>i===index?{...c,[key]:value}:c)}))
  }

  function addChoice(){
    setEditor(prev=>prev&&prev.choices.length<4?{...prev,choices:[...prev.choices,blankChoice(`Pilihan ${String.fromCharCode(65+prev.choices.length)}`)]}:prev)
  }

  function removeChoice(index){
    setEditor(prev=>prev&&prev.choices.length>2?{...prev,choices:prev.choices.filter((_,i)=>i!==index)}:prev)
  }

  async function saveRound(){
    if(!client||!session||!editor)return
    if(session.stage!=='lobby'){setError('Round hanya dapat diedit saat sesi berada di Lobby.');return}
    if(!editor.title.trim()||!editor.kicker.trim()||!editor.description.trim()){
      setError('Kicker, judul, dan tantangan wajib diisi.');return
    }
    if(editor.choices.some(c=>!c.label.trim()||!c.description.trim()||!c.reveal_text.trim())){
      setError('Setiap pilihan wajib memiliki label, deskripsi, dan consequence.');return
    }

    setBusy(true);setError('');setNotice('')
    const payload=editor.choices.map(c=>({
      label:c.label.trim(),
      description:c.description.trim(),
      balance_delta:Number(c.balance_delta)||0,
      finance_delta:Number(c.finance_delta)||0,
      academic_delta:Number(c.academic_delta)||0,
      social_delta:Number(c.social_delta)||0,
      wellbeing_delta:Number(c.wellbeing_delta)||0,
      reveal_text:c.reveal_text.trim()
    }))
    const {error:e}=await client.rpc('host_save_round',{
      p_session_id:session.id,
      p_event_id:editor.id||null,
      p_kicker:editor.kicker,
      p_title:editor.title,
      p_description:editor.description,
      p_learning_point:editor.learning_point||'',
      p_choices:payload
    })
    if(e){setError(e.message);setBusy(false);return}
    setNotice(editor.id?'Round berhasil diperbarui.':'Round baru berhasil ditambahkan.')
    setEditor(null)
    await load()
    setBusy(false)
  }

  async function deleteRound(round){
    if(!client||!session)return
    if(session.stage!=='lobby'){setError('Round hanya dapat dihapus saat sesi berada di Lobby.');return}
    const ok=window.confirm(`Hapus Round ${round.event_order}: ${round.title}? Urutan round setelahnya akan dirapikan otomatis.`)
    if(!ok)return
    setBusy(true);setError('');setNotice('')
    const {error:e}=await client.rpc('host_delete_round',{p_session_id:session.id,p_event_id:round.id})
    if(e){setError(e.message);setBusy(false);return}
    if(editor?.id===round.id)setEditor(null)
    setNotice('Round berhasil dihapus dan urutan diperbarui.')
    await load()
    setBusy(false)
  }

  async function moveRound(round,direction){
    if(!client||!session||session.stage!=='lobby')return
    const ordered=[...rounds].sort((a,b)=>a.event_order-b.event_order)
    const from=ordered.findIndex(r=>r.id===round.id)
    const to=from+direction
    if(from<0||to<0||to>=ordered.length)return
    const next=[...ordered]
    ;[next[from],next[to]]=[next[to],next[from]]
    setBusy(true);setError('');setNotice('')
    const {error:e}=await client.rpc('host_reorder_rounds',{p_session_id:session.id,p_event_ids:next.map(r=>r.id)})
    if(e){setError(e.message);setBusy(false);return}
    setNotice('Urutan round berhasil diperbarui.')
    await load()
    setBusy(false)
  }

  if(!secret)return <main className="shell"><div className="panel" style={{maxWidth:520,margin:'12vh auto 0'}}><span className="eyebrow">HOST ACCESS</span><h2>Masukkan host secret</h2><p>Secret hanya digunakan pada perangkat host dan disimpan di session browser.</p><div className="field"><input className="input" type="password" placeholder="Host secret" onKeyDown={e=>{if(e.key==='Enter')saveSecret(e.currentTarget.value)}} /></div><p className="tiny">Tekan Enter untuk masuk.</p></div></main>

  const allBudgeted=(stats?.players||0)>0 && (stats?.budgeted||0)===(stats?.players||0)
  const roundEditingLocked=session?.stage!=='lobby'

  return <main className="shell">
    <div className="topbar"><div className="brand"><span className="live-dot"/>Host Dashboard</div><span className="pill">{session?.code||'—'}</span></div>
    {error&&<div className="error">{error}</div>}
    {notice&&<div className="success">{notice}</div>}

    <div className="grid">
      <section className="panel span-8"><span className="eyebrow">SESSION CONTROL</span><h2>{session?.title||'Session not found'}</h2><p>Stage: <b>{session?.stage}</b> · Phase: <b>{session?.event_phase}</b> · Event: <b>{session?.current_event_order||'—'}</b></p>
        <div className="host-controls"><button className="btn btn-secondary" disabled={busy||!session} onClick={()=>update({stage:'budgeting',event_phase:'idle',current_event_order:null})}>1. Open Budgeting</button><button className="btn btn-primary" disabled={busy||!allBudgeted||(rounds.length===0)} onClick={startRoundOne}>2. Start Round 1</button><button className="btn btn-ghost" disabled={busy||session?.stage!=='game'} onClick={()=>update({event_phase:'reveal'})}>Reveal Consequence</button><button className="btn btn-primary" disabled={busy||session?.stage!=='game'} onClick={nextEvent}>Next Round →</button><button className="btn btn-danger" disabled={busy||!session} onClick={()=>update({stage:'finished',event_phase:'idle'})}>Finish Game</button><button className="btn btn-ghost" onClick={()=>{sessionStorage.removeItem('ssb-host-secret');setSecret('')}}>Lock Host</button></div>
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

      <section className="panel span-12">
        <div className="round-manager-head">
          <div><span className="eyebrow">ROUND MANAGER</span><h2>Atur Pertanyaan & Tantangan</h2><p>Tambah, edit, hapus, atau ubah urutan round sebelum permainan dimulai.</p></div>
          <button className="btn btn-secondary" disabled={busy||!session||roundEditingLocked} onClick={openNewRound}>+ Tambah Round</button>
        </div>
        {roundEditingLocked&&<div className="round-lock-note">🔒 Editing round dikunci setelah sesi meninggalkan Lobby. Reset/kembalikan sesi ke lobby sebelum mengubah struktur game.</div>}
        <div className="round-table-wrap">
          <table className="round-table">
            <thead><tr><th>#</th><th>Tipe</th><th>Tantangan</th><th>Pilihan</th><th>Learning Point</th><th>Aksi</th></tr></thead>
            <tbody>{rounds.length===0?<tr><td colSpan="6">Belum ada round.</td></tr>:rounds.map((round,index)=><tr key={round.id}>
              <td><b>{round.event_order}</b></td>
              <td><span className="round-kicker">{round.kicker}</span></td>
              <td><b>{round.title}</b><small>{round.description}</small></td>
              <td>{round.choices.length}</td>
              <td><small>{round.learning_point||'—'}</small></td>
              <td><div className="round-actions">
                <button className="btn btn-ghost btn-compact" disabled={busy||roundEditingLocked||index===0} onClick={()=>moveRound(round,-1)}>↑</button>
                <button className="btn btn-ghost btn-compact" disabled={busy||roundEditingLocked||index===rounds.length-1} onClick={()=>moveRound(round,1)}>↓</button>
                <button className="btn btn-secondary btn-compact" disabled={busy||roundEditingLocked} onClick={()=>openEditRound(round)}>Edit</button>
                <button className="btn btn-danger btn-compact" disabled={busy||roundEditingLocked} onClick={()=>deleteRound(round)}>Delete</button>
              </div></td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>

      {editor&&<section className="panel span-12 round-editor">
        <div className="round-manager-head"><div><span className="eyebrow">{editor.id?'EDIT ROUND':'NEW ROUND'}</span><h2>{editor.id?'Ubah tantangan':'Buat tantangan baru'}</h2></div><button className="btn btn-ghost" disabled={busy} onClick={()=>setEditor(null)}>Tutup</button></div>
        <div className="round-editor-grid">
          <div className="field"><label>Tipe / Kicker</label><input className="input" value={editor.kicker} onChange={e=>setEditor({...editor,kicker:e.target.value})} placeholder="SOCIAL LIFE"/></div>
          <div className="field"><label>Judul Round</label><input className="input" value={editor.title} onChange={e=>setEditor({...editor,title:e.target.value})} placeholder="Teman Baru"/></div>
        </div>
        <div className="field"><label>Pertanyaan / Tantangan</label><textarea className="input textarea" value={editor.description} onChange={e=>setEditor({...editor,description:e.target.value})} placeholder="Ceritakan situasi yang harus dihadapi mahasiswa..."/></div>
        <div className="field"><label>Learning Point</label><textarea className="input textarea" value={editor.learning_point} onChange={e=>setEditor({...editor,learning_point:e.target.value})} placeholder="Pesan edukasi yang muncul saat reveal..."/></div>

        <div className="round-choice-head"><div><span className="eyebrow">DECISION OPTIONS</span><h3>Pilihan Keputusan</h3></div><button className="btn btn-ghost" disabled={busy||editor.choices.length>=4} onClick={addChoice}>+ Pilihan</button></div>
        <div className="round-choice-list">{editor.choices.map((choice,index)=><div className="round-choice-editor" key={index}>
          <div className="round-choice-head"><h3>Pilihan {index+1}</h3><button className="btn btn-danger btn-compact" disabled={busy||editor.choices.length<=2} onClick={()=>removeChoice(index)}>Hapus Pilihan</button></div>
          <div className="round-editor-grid">
            <div className="field"><label>Label</label><input className="input" value={choice.label} onChange={e=>updateChoice(index,'label',e.target.value)}/></div>
            <div className="field"><label>Deskripsi</label><input className="input" value={choice.description} onChange={e=>updateChoice(index,'description',e.target.value)}/></div>
          </div>
          <div className="delta-grid">
            {[['balance_delta','Uang (Rp)'],['finance_delta','Finance'],['academic_delta','Academic'],['social_delta','Social'],['wellbeing_delta','Wellbeing']].map(([key,label])=><div className="field" key={key}><label>{label}</label><input className="input" type="number" value={choice[key]} onChange={e=>updateChoice(index,key,e.target.value)}/></div>)}
          </div>
          <div className="field"><label>Consequence / Reveal</label><textarea className="input textarea" value={choice.reveal_text} onChange={e=>updateChoice(index,'reveal_text',e.target.value)} placeholder="Jelaskan konsekuensi dari keputusan ini..."/></div>
        </div>)}</div>
        <div className="button-row"><button className="btn btn-primary" disabled={busy} onClick={saveRound}>{busy?'Menyimpan...':'Save Round'}</button><button className="btn btn-ghost" disabled={busy} onClick={()=>setEditor(null)}>Cancel</button></div>
      </section>}

      <section className="panel span-12"><span className="eyebrow">CURRENT VOTE</span><div className="bars">{(stats?.choices||[]).length===0?<p>Belum ada vote pada event aktif.</p>:(stats.choices.map(c=>{const total=stats.choices.reduce((a,x)=>a+x.votes,0)||1;const pct=Math.round(c.votes/total*100);return <div className="bar-row" key={c.choice_label}><b>{c.choice_label}</b><div className="bar-track"><div className="bar-fill" style={{width:`${pct}%`}}/></div><span>{c.votes} · {pct}%</span></div>}))}</div></section>
    </div>
  </main>
}
