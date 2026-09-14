'use client'
import { useEffect, useMemo, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { DEFAULT_SESSION_CODE, rupiah } from '../../lib/game'
import { getPublicClient } from '../../lib/supabase'

export default function ScreenPage(){
  const [session,setSession]=useState(null)
  const [scores,setScores]=useState([])
  const [stats,setStats]=useState([])
  const [participantCount,setParticipantCount]=useState(0)
  const [currentEvent,setCurrentEvent]=useState(null)
  const [choices,setChoices]=useState([])
  const [code,setCode]=useState(DEFAULT_SESSION_CODE)
  const [joinUrl,setJoinUrl]=useState('')
  const [mounted,setMounted]=useState(false)
  const client=useMemo(()=>getPublicClient(),[])

  useEffect(()=>{
    const resolvedCode=(new URLSearchParams(window.location.search).get('code')||DEFAULT_SESSION_CODE).toUpperCase()
    setCode(resolvedCode)
    setJoinUrl(`${window.location.origin}/play?code=${resolvedCode}`)
    setMounted(true)
  },[])

  useEffect(()=>{
    if(!mounted)return
    load()
    const t=setInterval(load,1500)
    return()=>clearInterval(t)
  },[mounted,code])

  async function load(){
    const {data:s}=await client.from('game_sessions')
      .select('id,code,title,stage,event_phase,current_event_order')
      .eq('code',code).maybeSingle()
    if(!s)return
    setSession(s)

    const [{data:leaders,count},{data:vote},{data:eventData}]=await Promise.all([
      client.from('public_scores').select('player_id,name,faculty,smart_score',{count:'exact'}).eq('session_id',s.id).order('smart_score',{ascending:false}).limit(8),
      s.current_event_order?client.from('event_choice_stats').select('choice_id,choice_label,votes,event_title,event_order').eq('session_id',s.id).eq('event_order',s.current_event_order):Promise.resolve({data:[]}),
      s.current_event_order?client.from('game_events').select('id,event_order,kicker,title,description,learning_point').eq('session_id',s.id).eq('event_order',s.current_event_order).maybeSingle():Promise.resolve({data:null})
    ])

    setScores(leaders||[])
    setParticipantCount(count||0)
    setStats(vote||[])
    setCurrentEvent(eventData||null)

    if(eventData?.id){
      const {data:choiceData}=await client.from('event_choices')
        .select('id,choice_order,label,description,balance_delta,finance_delta,academic_delta,social_delta,wellbeing_delta,reveal_text')
        .eq('event_id',eventData.id).order('choice_order')
      setChoices(choiceData||[])
    }else setChoices([])
  }

  const totalVotes=stats.reduce((a,x)=>a+x.votes,0)
  const mergedChoices=choices.map(choice=>{
    const live=stats.find(s=>s.choice_id===choice.id)
    const votes=live?.votes||0
    return {...choice,votes,pct:totalVotes?Math.round(votes/totalVotes*100):0}
  })
  const topVotes=Math.max(0,...mergedChoices.map(c=>c.votes))

  return <main className="screen-shell">
    <div className="screen-title">
      <span className="eyebrow">SMART STUDENT BUDGET · LIVE</span>
      <h1 className={session?.stage==='game'?'screen-heading-compact':''}>{session?.title||'Smart Student Budget'}</h1>
    </div>

    {(!session||session.stage==='lobby')&&<div className="screen-grid">
      <section className="screen-card center">
        <div className="qr-wrap">{joinUrl?<QRCodeSVG value={joinUrl} size={250}/>:<div className="qr-placeholder">Menyiapkan QR...</div>}</div>
        <h2 style={{marginTop:20}}>Scan & Join</h2>
        <p>{joinUrl||`/play?code=${code}`}</p>
      </section>
      <section className="screen-card center"><span className="eyebrow">CONNECTED</span><div className="screen-metric">{participantCount}</div><p>mahasiswa sudah masuk</p><div className="pill" style={{display:'inline-block'}}>CODE {code}</div></section>
    </div>}

    {session?.stage==='budgeting'&&<section className="screen-card center"><span className="eyebrow">BUILD YOUR BUDGET</span><div className="screen-metric">{participantCount}</div><h2>Atur Rp2.500.000 untuk 30 hari.</h2><p>Jangan lihat pilihan temanmu. Ini tentang kebiasaan uangmu sendiri.</p></section>}

    {session?.stage==='game'&&session.event_phase!=='reveal'&&<div className="screen-grid">
      <section className="screen-card">
        <div className="screen-round-head"><div><span className="eyebrow">ROUND {session.current_event_order} · {currentEvent?.kicker}</span><h2>{currentEvent?.title||stats[0]?.event_title||'Make your choice'}</h2></div><div className="screen-response"><b>{totalVotes}</b><span>dari {participantCount} menjawab</span></div></div>
        <p className="screen-description">{currentEvent?.description}</p>
        <div className="bars screen-bars">{stats.length===0?<p>Menunggu jawaban...</p>:stats.map(c=>{const pct=totalVotes?Math.round(c.votes/totalVotes*100):0;return <div className="bar-row" key={c.choice_id}><b>{c.choice_label}</b><div className="bar-track"><div className="bar-fill" style={{width:`${pct}%`}}/></div><span>{pct}%</span></div>})}</div>
        <div className="screen-live-note">Voting masih berlangsung — diskusikan pilihanmu setelah reveal.</div>
      </section>
      <section className="screen-card"><span className="eyebrow">SMART STUDENT LEADERBOARD</span><div className="leaderboard">{scores.slice(0,6).map((p,i)=><div className="leader" key={p.player_id}><div className="leader-rank">#{i+1}</div><div><b>{p.name}</b><div className="tiny">{p.faculty}</div></div><b>{p.smart_score}</b></div>)}</div></section>
    </div>}

    {session?.stage==='game'&&session.event_phase==='reveal'&&<>
      <section className="screen-card reveal-hero">
        <div><span className="eyebrow">ROUND {session.current_event_order} · CONSEQUENCE REVEAL</span><h2>{currentEvent?.title}</h2><p className="screen-description">{currentEvent?.description}</p></div>
        <div className="screen-response reveal-response"><b>{totalVotes}</b><span>jawaban masuk</span></div>
      </section>

      <div className="reveal-grid">
        {mergedChoices.map(choice=><article className={`reveal-choice ${choice.votes===topVotes&&topVotes>0?'popular':''}`} key={choice.id}>
          <div className="reveal-choice-top"><div><span className="eyebrow">PILIHAN {choice.choice_order}</span><h3>{choice.label}</h3></div><div className="reveal-share"><b>{choice.pct}%</b><span>{choice.votes} mahasiswa</span></div></div>
          <p className="reveal-desc">{choice.description}</p>
          <div className={`reveal-money ${choice.balance_delta>0?'positive':choice.balance_delta<0?'negative':'neutral'}`}>{choice.balance_delta>0?'+':''}{rupiah(choice.balance_delta)}</div>
          <div className="reveal-impact">
            <Impact label="Finance" value={choice.finance_delta}/><Impact label="Academic" value={choice.academic_delta}/><Impact label="Social" value={choice.social_delta}/><Impact label="Wellbeing" value={choice.wellbeing_delta}/>
          </div>
          <div className="reveal-reason"><span>KENAPA?</span><p>{choice.reveal_text}</p></div>
          {choice.votes===topVotes&&topVotes>0&&<div className="popular-badge">PILIHAN TERBANYAK</div>}
        </article>)}
      </div>

      <section className="takeaway-card"><span className="eyebrow">KEY TAKEAWAY</span><h2>{currentEvent?.learning_point||'Setiap keputusan keuangan punya trade-off. Lihat bukan hanya harga hari ini, tetapi juga dampaknya pada tujuanmu.'}</h2></section>
    </>}

    {session?.stage==='finished'&&<section className="screen-card"><div className="center"><span className="eyebrow">30 DAYS COMPLETE</span><h1 style={{fontSize:'clamp(3rem,8vw,6.8rem)'}}>Smart Student Leaderboard</h1></div><div className="leaderboard" style={{maxWidth:900,margin:'30px auto 0'}}>{scores.map((p,i)=><div className="leader" key={p.player_id}><div className="leader-rank">#{i+1}</div><div><b>{p.name}</b><div className="tiny">{p.faculty}</div></div><b>{p.smart_score}</b></div>)}</div></section>}
  </main>
}

function Impact({label,value}){
  const cls=value>0?'positive':value<0?'negative':'neutral'
  return <span className={`screen-impact ${cls}`}>{label} {value>0?'+':''}{value}</span>
}
