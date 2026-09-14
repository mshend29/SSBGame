'use client'
import { useEffect, useMemo, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { DEFAULT_SESSION_CODE } from '../../lib/game'
import { getPublicClient } from '../../lib/supabase'

export default function ScreenPage(){
  const [session,setSession]=useState(null); const [scores,setScores]=useState([]); const [stats,setStats]=useState([]); const [participantCount,setParticipantCount]=useState(0)
  const client=useMemo(()=>getPublicClient(),[])
  const code=typeof window!=='undefined'?(new URLSearchParams(window.location.search).get('code')||DEFAULT_SESSION_CODE).toUpperCase():DEFAULT_SESSION_CODE
  const joinUrl=typeof window!=='undefined'?`${window.location.origin}/play?code=${code}`:`/play?code=${code}`
  useEffect(()=>{load();const t=setInterval(load,1800);return()=>clearInterval(t)},[])
  async function load(){
    const {data:s}=await client.from('game_sessions').select('id,code,title,stage,event_phase,current_event_order').eq('code',code).maybeSingle(); if(!s)return; setSession(s)
    const [{data:leaders,count},{data:vote}]=await Promise.all([
      client.from('public_scores').select('player_id,name,faculty,smart_score',{count:'exact'}).eq('session_id',s.id).order('smart_score',{ascending:false}).limit(8),
      s.current_event_order?client.from('event_choice_stats').select('choice_label,votes,event_title,event_order').eq('session_id',s.id).eq('event_order',s.current_event_order):Promise.resolve({data:[]})
    ]); setScores(leaders||[]);setParticipantCount(count||0);setStats(vote||[])
  }
  const totalVotes=stats.reduce((a,x)=>a+x.votes,0)
  return <main className="screen-shell"><div className="screen-title"><span className="eyebrow">SMART STUDENT BUDGET · LIVE</span><h1 style={{fontSize:'clamp(3rem,7vw,6rem)'}}>{session?.title||'Smart Student Budget'}</h1></div>
    {(!session||session.stage==='lobby')&&<div className="screen-grid"><section className="screen-card center"><div className="qr-wrap"><QRCodeSVG value={joinUrl} size={250}/></div><h2 style={{marginTop:20}}>Scan & Join</h2><p>{joinUrl}</p></section><section className="screen-card center"><span className="eyebrow">CONNECTED</span><div className="screen-metric">{participantCount}</div><p>mahasiswa sudah masuk</p><div className="pill" style={{display:'inline-block'}}>CODE {code}</div></section></div>}
    {session?.stage==='budgeting'&&<section className="screen-card center"><span className="eyebrow">BUILD YOUR BUDGET</span><div className="screen-metric">{participantCount}</div><h2>Atur Rp2.500.000 untuk 30 hari.</h2><p>Jangan lihat pilihan temanmu. Ini tentang kebiasaan uangmu sendiri.</p></section>}
    {session?.stage==='game'&&<div className="screen-grid"><section className="screen-card"><span className="eyebrow">ROUND {session.current_event_order}</span><h2>{stats[0]?.event_title||'Make your choice'}</h2><div className="bars" style={{marginTop:28}}>{stats.length===0?<p>Menunggu jawaban...</p>:stats.map(c=>{const pct=totalVotes?Math.round(c.votes/totalVotes*100):0;return <div className="bar-row" key={c.choice_label}><b>{c.choice_label}</b><div className="bar-track"><div className="bar-fill" style={{width:`${pct}%`}}/></div><span>{pct}%</span></div>})}</div><p style={{marginTop:24}}>{totalVotes} jawaban masuk · {session.event_phase==='reveal'?'CONSEQUENCE REVEALED':'VOTING LIVE'}</p></section><section className="screen-card"><span className="eyebrow">SMART STUDENT LEADERBOARD</span><div className="leaderboard">{scores.slice(0,6).map((p,i)=><div className="leader" key={p.player_id}><div className="leader-rank">#{i+1}</div><div><b>{p.name}</b><div className="tiny">{p.faculty}</div></div><b>{p.smart_score}</b></div>)}</div></section></div>}
    {session?.stage==='finished'&&<section className="screen-card"><div className="center"><span className="eyebrow">30 DAYS COMPLETE</span><h1 style={{fontSize:'clamp(3rem,8vw,6.8rem)'}}>Smart Student Leaderboard</h1></div><div className="leaderboard" style={{maxWidth:900,margin:'30px auto 0'}}>{scores.map((p,i)=><div className="leader" key={p.player_id}><div className="leader-rank">#{i+1}</div><div><b>{p.name}</b><div className="tiny">{p.faculty}</div></div><b>{p.smart_score}</b></div>)}</div></section>}
  </main>
}
