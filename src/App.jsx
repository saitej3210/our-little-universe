import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Play, Info, Search, Bell, ChevronDown, Plus, Heart, Volume2, VolumeX,
  LockKeyhole, ArrowLeft, Film, Image as ImageIcon, Settings, Upload, Users,
  Music2, CalendarDays, Menu, X, Check, Clock3, Sparkles, SkipForward,
  Maximize, Pause, ListVideo, SlidersHorizontal, RotateCcw, Globe, Home as HomeIcon
} from 'lucide-react'
import { profiles, memories, rows } from './data'
import { supabase, isSupabaseConfigured, hasRole } from './lib/supabase'
import AdminDashboard from './AdminDashboard'

function Brand({ compact = false }) {
  return <span className="brand"><span className="brand-mark">◈</span>{!compact && <span>OUR LITTLE UNIVERSE</span>}</span>
}

function Intro({ onDone, onReplay }) {
  const [sound, setSound] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const finish = () => {
    if (leaving) return
    setLeaving(true)
    window.setTimeout(onDone, 650)
  }
  useEffect(() => {
    const timer = window.setTimeout(finish, 4300)
    return () => window.clearTimeout(timer)
  }, [])
  const playTone = () => {
    setSound(true)
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext
      const ctx = new Ctx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'; osc.frequency.setValueAtTime(110, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 1.1)
      gain.gain.setValueAtTime(.0001, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(.08, ctx.currentTime + .15)
      gain.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + 1.4)
      osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 1.45)
    } catch { /* Sound is an optional enhancement. */ }
  }
  return <div className={`intro-screen ${leaving ? 'intro-leave' : ''}`}>
    <div className="intro-orbit orbit-one"/><div className="intro-orbit orbit-two"/><div className="intro-glow"/>
    <div className="intro-stars"><i/><i/><i/><i/><i/><i/><i/></div>
    <div className="intro-center"><div className="intro-symbol">◈</div><p className="intro-kicker">A WORLD MADE OF MOMENTS</p><h1>OUR LITTLE <span>UNIVERSE</span></h1><div className="intro-line"/><p className="intro-subtitle">Some stories deserve their own universe.</p></div>
    <div className="intro-controls"><button onClick={playTone} className="intro-sound">{sound ? <Volume2 size={15}/> : <VolumeX size={15}/>} {sound ? 'SOUND ON' : 'ENABLE SOUND'}</button><button onClick={finish} className="skip-intro">SKIP INTRO <SkipForward size={14}/></button></div>
  </div>
}

function Login({ onEnter, onAdmin, onReplay }) {
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [mode, setMode] = useState('viewer')
  const [profiles, setProfiles] = useState([])
  const [chosenProfile, setChosenProfile] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loadingProfiles, setLoadingProfiles] = useState(true)

  useEffect(() => {
    let active = true
    if (!isSupabaseConfigured) { setLoadingProfiles(false); return }
    supabase.functions.invoke('profile-picker', { body: {} }).then(({ data, error: fnError }) => {
      if (!active) return
      if (fnError) {
        // Fallback to safe profile metadata RPC; profile images appear after sign-in.
        return supabase.rpc('list_profiles_for_login').then(({ data: rows, error: rpcError }) => {
          if (!active) return
          if (rpcError) setError('Could not load profiles. Deploy the profile-picker function and apply migration 003.')
          else setProfiles(rows || [])
        })
      }
      setProfiles(data?.profiles || [])
    }).catch(() => { if (active) setError('Could not load profiles. Check the profile-picker Edge Function.') })
      .finally(() => { if (active) setLoadingProfiles(false) })
    return () => { active = false }
  }, [])

  const submit = async event => {
    event.preventDefault()
    setError('')
    if (!password.trim()) return setError('Enter your password to continue.')
    if (!isSupabaseConfigured) return setError('Connect Supabase before signing in.')
    setBusy(true)
    try {
      if (mode === 'viewer') {
        if (!chosenProfile?.login_email) throw new Error('Choose a profile first.')
        const { data, error: authError } = await supabase.auth.signInWithPassword({ email: chosenProfile.login_email, password })
        if (authError) throw authError
        if (!hasRole(data.user, 'viewer') || data.user.app_metadata?.profile_id !== chosenProfile.id) {
          await supabase.auth.signOut()
          throw new Error('This account is not authorised for that profile.')
        }
        onEnter({ user: data.user, profile: chosenProfile })
      } else {
        if (!email.trim()) throw new Error('Enter the administrator email.')
        const { data, error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (authError) throw authError
        if (!hasRole(data.user, 'admin')) {
          await supabase.auth.signOut()
          throw new Error('This account is not authorised for admin access.')
        }
        onAdmin(data.user)
      }
    } catch (err) { setError(err.message || 'Sign-in failed. Check your credentials.') }
    finally { setBusy(false) }
  }

  return <main className="login-screen profile-login-screen">
    <div className="login-backdrop"/><div className="login-top"><Brand/><button className="replay-link" onClick={onReplay}><RotateCcw size={14}/> Replay intro</button></div>
    <div className="profile-login-wrap">
      <div className="profile-login-heading"><p className="eyebrow">A PRIVATE COLLECTION</p><h1>Who's watching?</h1><p className="muted">Choose your own little world.</p></div>
      <div className="auth-mode-switch"><button type="button" className={mode==='viewer'?'selected':''} onClick={()=>{setMode('viewer');setChosenProfile(null);setPassword('');setError('')}}>Viewer profiles</button><button type="button" className={mode==='admin'?'selected':''} onClick={()=>{setMode('admin');setChosenProfile(null);setPassword('');setError('')}}>Admin access</button></div>
      {mode === 'viewer' ? <>
        {!chosenProfile ? <>
          {loadingProfiles ? <p className="muted profile-loading">Loading profiles…</p> : <div className="netflix-profile-grid">
            {profiles.map((p, i) => <button type="button" key={p.id} className="netflix-profile-card" onClick={()=>{setChosenProfile(p);setPassword('');setError('')}}>
              <span className="netflix-profile-art" style={{backgroundImage:p.cover_url ? `linear-gradient(0deg,#000b,transparent 80%),url("${p.cover_url}")` : undefined, '--profile-accent':p.accent_color || '#784653'}}>
                {p.avatar_url ? <img src={p.avatar_url} alt=""/> : <span className="netflix-profile-initial">{(p.name || '?').trim().charAt(0).toUpperCase()}</span>}
              </span><span className="netflix-profile-name">{p.name}</span>
            </button>)}
          </div>}
          {!loadingProfiles && profiles.length === 0 && <p className="error">No viewer profiles found. Create profiles from Admin access first.</p>}
        </> : <form className="profile-password-panel" onSubmit={submit}>
          <button type="button" className="profile-back-link" onClick={()=>{setChosenProfile(null);setPassword('');setError('')}}><ArrowLeft size={15}/> All profiles</button>
          <div className="chosen-profile-chip"><span className="chosen-profile-avatar" style={{backgroundImage:chosenProfile.avatar_url?`url("${chosenProfile.avatar_url}")`:undefined}}>{!chosenProfile.avatar_url && (chosenProfile.name || '?').charAt(0).toUpperCase()}</span><div><small>CONTINUE AS</small><strong>{chosenProfile.name}</strong></div></div>
          <label htmlFor="profile-password">PROFILE PASSWORD</label><input id="profile-password" autoFocus type="password" autoComplete="current-password" value={password} onChange={e=>{setPassword(e.target.value);setError('')}} placeholder="Enter your password"/>
          {error && <p className="error">{error}</p>}
          <button className="primary-btn full" type="submit" disabled={busy}>{busy?'Opening your world…':'Continue'} <Play size={15} fill="currentColor"/></button>
        </form>}
      </> : <form className="admin-login-panel" onSubmit={submit}><label htmlFor="admin-email">ADMIN EMAIL</label><input id="admin-email" type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Admin email"/><label htmlFor="admin-password">PASSWORD</label><input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={e=>{setPassword(e.target.value);setError('')}} placeholder="Admin password"/>{error && <p className="error">{error}</p>}<button className="primary-btn full" type="submit" disabled={busy}>{busy?'Signing in…':'Admin sign in'} <Play size={15} fill="currentColor"/></button></form>}
      {mode==='viewer' && !chosenProfile && error && <p className="error profile-picker-error">{error}</p>}
      <p className="fine-print">Each profile has its own password and private memories. Admin access is separate.</p>
    </div><div className="login-foot">A PRIVATE WORLD, JUST FOR US <span>© OUR LITTLE UNIVERSE</span></div>
  </main>
}

function ProfileSelect({ onSelect, onBack }) {
  return <main className="profile-screen"><button className="back-brand" onClick={onBack}><Brand/></button><div className="profile-content"><p className="eyebrow">ONE UNIVERSE. MANY LITTLE WORLDS.</p><h1>Who's watching?</h1><p className="muted">Choose a memory space to step into.</p><div className="profiles">{profiles.map((p,i) => <button className="profile-choice" key={p.id} onClick={() => onSelect(p)}><span className={`avatar avatar-${i}`} style={{'--avatar-color':p.color}}>{p.emoji}</span><span>{p.name}</span></button>)}<button className="profile-choice manage-choice" onClick={() => onSelect(profiles[0])}><span className="avatar add-avatar"><Plus/></span><span>Manage profiles</span></button></div><button className="manage-profiles" onClick={() => onSelect(profiles[0])}>MANAGE PROFILES</button></div></main>
}

function Nav({ profile, onProfile, onAdmin, onNavigate, onSearch, active = 'Home' }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const links = ['Home', 'Newly Added', 'Our Story', 'Memories', 'Categories', 'My List']
  return <header className="navbar"><div className="nav-left"><button className="mobile-menu" aria-label="Toggle navigation" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen?<X/>:<Menu/>}</button><button className="brand-button" onClick={()=>onNavigate('Home')}><Brand/></button>
    <nav className={menuOpen?'nav-links open':'nav-links'}>{links.map(item=><button key={item} className={active===item?'nav-active':''} onClick={()=>{setMenuOpen(false);onNavigate(item)}}>{item}</button>)}</nav></div>
    <div className="nav-right"><button className="icon-btn" aria-label="Search" onClick={onSearch}><Search/></button><button className="icon-btn notification" aria-label="Notifications" title="No new notifications"><Bell/></button><button className="profile-menu" onClick={onProfile} title="Switch profile"><span className="mini-avatar">{profile?.emoji || '🌙'}</span><ChevronDown size={14}/></button><button className="admin-link" onClick={onAdmin}>ADMIN</button></div></header>
}

function MemoryCard({ memory, onOpen, onAdd, saved, index = 0 }) {
  return <article className="memory-card" style={{'--card-index':index}}><div className="poster-wrap"><button className="poster-button" onClick={() => onOpen(memory)} aria-label={`Open ${memory.title}`}><img src={memory.image} alt={memory.title} loading="lazy"/><span className="poster-shade"/><span className="poster-title">{memory.title}</span><span className="poster-meta">{memory.category}</span></button>
    <div className="poster-preview"><div className="preview-actions"><button className="preview-play" onClick={()=>onOpen(memory)} aria-label="Play"><Play fill="currentColor" size={16}/></button><button onClick={()=>onAdd(memory)} aria-label="Add to list" className={saved?'preview-round is-saved':'preview-round'}>{saved?<Check size={16}/>:<Plus size={16}/>}</button><button className="preview-round" onClick={()=>onOpen(memory)} aria-label="More information"><Info size={16}/></button></div><div className="preview-title">{memory.title}</div><div className="preview-meta"><span className="match">OUR ORIGINAL</span><span>{memory.year}</span><span>{memory.duration}</span></div><p>{memory.description}</p><div className="preview-category">{memory.category}</div></div></div>
    <div className="card-info"><div><strong>{memory.title}</strong><small>{memory.duration}</small></div><button className={saved?'round-action active':'round-action'} onClick={() => onAdd(memory)} aria-label="Add to My List">{saved?<Check size={16}/>:<Plus size={17}/>}</button></div></article>
}

function MemoryRow({ row, onOpen, onAdd, favorites, allMemories = memories }) {
  const items = row.ids.map(id => allMemories.find(m => String(m.id) === String(id))).filter(Boolean)
  if (!items.length) return null
  return <section className="memory-row"><div className="row-heading"><h2>{row.title}</h2><span>{items.length} {items.length===1?'memory':'memories'} <b>›</b></span></div><div className="card-track">{items.map((m,i)=><MemoryCard key={m.id} memory={m} index={i} onOpen={onOpen} onAdd={onAdd} saved={favorites.includes(m.id)}/>)}</div></section>
}

function Home({ profile, siteSettings, profileCategories = [], onProfile, onAdmin, onOpen, favorites, onAdd, onSearch, onReplay, onNavigate, activeSection, onToast, memoryItems = memories }) {
  const featured = memoryItems[0] || memories[1]
  const categories = profileCategories.length ? profileCategories : Array.from(new Set(memoryItems.map(m=>m.category).filter(Boolean))).map(name=>({ name }))
  const categoryNames = categories.map(c => typeof c === 'string' ? c : c.name).filter(Boolean)
  const newestItems = [...memoryItems].sort((a,b)=>new Date(b.created_at || 0)-new Date(a.created_at || 0))
  const highlight = newestItems.find(m => m.is_highlighted) || null
  const [showNewArrival, setShowNewArrival] = useState(false)
  const highlightSeenKey = profile?.id && highlight?.id ? `olu-highlight-seen-${profile.id}-${highlight.id}` : ''
  const closeNewArrival = () => {
    if (highlightSeenKey) localStorage.setItem(highlightSeenKey, '1')
    setShowNewArrival(false)
  }
  useEffect(() => {
    if (!highlight || !highlightSeenKey) { setShowNewArrival(false); return }
    if (localStorage.getItem(highlightSeenKey) === '1') { setShowNewArrival(false); return }
    setShowNewArrival(true)
    const timer = window.setTimeout(() => {
      localStorage.setItem(highlightSeenKey, '1')
      setShowNewArrival(false)
    }, 10000)
    return () => window.clearTimeout(timer)
  }, [highlightSeenKey])
  const [category, setCategory] = useState('All')
  const favoriteItems = memoryItems.filter(m=>favorites.includes(m.id))
  const filtered = category==='All' ? memoryItems : memoryItems.filter(m=>m.category===category)
  const dynamicRows = categoryNames.map(c => ({ title: c, ids: memoryItems.filter(m=>m.category===c).map(m=>m.id) })).filter(row => row.ids.length)
  let visibleRows = dynamicRows
  if (activeSection==='My List') visibleRows = [{title:'My List',ids:favoriteItems.map(m=>m.id)}]
  if (activeSection==='Memories') visibleRows = [{title:'All Memories',ids:memoryItems.map(m=>m.id)}]
  if (activeSection==='Newly Added') visibleRows = [{title:'Newly Added',ids:newestItems.map(m=>m.id)}]
  if (activeSection==='Our Story') visibleRows = [{title:'Our Story · Chapters',ids:memoryItems.filter(m=>(m.category || '').toLowerCase()==='our story').map(m=>m.id)}]
  if (activeSection==='Categories') visibleRows = category==='All' ? dynamicRows : [{title:category,ids:filtered.map(m=>m.id)}]
  const isLanding = activeSection==='Home'
  return <div className="app-shell"><Nav profile={profile} onProfile={onProfile} onAdmin={onAdmin} onNavigate={onNavigate} onSearch={onSearch} active={activeSection}/>
    <main>{isLanding && <section className="hero" style={{backgroundImage:`linear-gradient(90deg,#080808 0%,rgba(8,8,8,.82) 34%,rgba(8,8,8,.12) 100%),linear-gradient(0deg,#080808 0%,transparent 55%),url(${siteSettings?.hero_background_url || profile?.cover_url || featured.image})`}}>{siteSettings?.hero_background_video_url && <video className="hero-background-video" src={siteSettings.hero_background_video_url} autoPlay muted loop playsInline preload="metadata" poster={siteSettings?.hero_background_url || profile?.cover_url || featured.image}/>}<div className="hero-content"><p className="eyebrow"><span className="red-mark">N</span> {siteSettings?.hero_kicker || 'OUR LITTLE UNIVERSE ORIGINAL'}</p><h1>{siteSettings?.hero_title || 'Little'}<br/><em>{siteSettings?.hero_emphasis || 'Adventures.'}</em></h1><p className="hero-copy">{siteSettings?.hero_subtitle || 'New roads, unexpected turns, and the little moments that made every journey ours.'}</p><div className="hero-meta"><span>✦ {siteSettings?.hero_collection_label || 'OUR STORY COLLECTION'}</span><span>•</span><span>{siteSettings?.hero_type_label || 'MEMORY FILM'}</span></div><div className="hero-actions"><button className="primary-btn" onClick={() => onOpen(featured)}><Play size={17} fill="currentColor"/> Play Memory</button><button className="secondary-btn" onClick={() => onOpen(featured)}><Info size={18}/> More Info</button></div></div><div className="hero-bottom-label">A COLLECTION MADE FOR {profile?.name?.toUpperCase() || 'YOU'} <span>{String(memoryItems.length).padStart(2,'0')} MOMENTS</span></div><div className="hero-rating">PRIVATE COLLECTION · U / ALL MOMENTS</div></section>}
      <div className="content-rows"><div className="welcome-line"><span>WELCOME BACK, {profile?.name?.toUpperCase() || 'YOU'}</span><span>YOUR PERSONAL UNIVERSE · JUST FOR YOU</span></div>
        {activeSection==='Categories' && <div className="category-filters"><button className={category==='All'?'filter-chip selected':'filter-chip'} onClick={()=>setCategory('All')}>All</button>{categoryNames.map(c=><button key={c} className={category===c?'filter-chip selected':'filter-chip'} onClick={()=>setCategory(c)}>{c}</button>)}</div>}
        {activeSection==='Categories' && category==='All' && <div className="profile-category-showcase">{categories.map(c=><button key={c.id || c.name} className="profile-category-tile" onClick={()=>setCategory(c.name)} style={{backgroundImage:`linear-gradient(0deg,#050505e8,transparent 80%),url("${c.poster_url || c.background_url || ''}")`}}><span>{c.name}</span><small>{memoryItems.filter(m=>m.category===c.name).length} memories</small></button>)}</div>}
        {activeSection==='Categories' && category!=='All' && (categories.find(c=>c.name===category)?.background_url || categories.find(c=>c.name===category)?.background_video_url) && <div className="category-selected-hero" style={{backgroundImage:categories.find(c=>c.name===category)?.background_url ? `linear-gradient(90deg,#050505 0%,#05050588 60%,transparent),url("${categories.find(c=>c.name===category).background_url}")` : 'linear-gradient(90deg,#050505 0%,#05050588 60%,transparent)'}}>{categories.find(c=>c.name===category)?.background_video_url && <video className="category-background-video" src={categories.find(c=>c.name===category).background_video_url} autoPlay muted loop playsInline/>}<div className="category-hero-copy"><p className="eyebrow">YOUR COLLECTION</p><h1>{category}</h1><p>{categories.find(c=>c.name===category).description}</p></div></div>}
        {activeSection==='Our Story' && <section className="story-intro"><p className="eyebrow">THE STORY SO FAR</p><h1>One story. <em>A thousand little moments.</em></h1><p>Browse the chapters in the order they became part of our universe.</p></section>}
        {activeSection==='My List' && <div className="section-intro"><p className="eyebrow">YOUR PERSONAL COLLECTION</p><h1>My <em>List</em></h1><p>Memories you saved for another look.</p></div>}
        {isLanding && newestItems.length > 0 && <MemoryRow row={{title:'Newly Added',ids:newestItems.slice(0,12).map(m=>m.id)}} onOpen={onOpen} onAdd={onAdd} favorites={favorites} allMemories={memoryItems}/>}
        {visibleRows.map(row=><MemoryRow key={row.title} row={row} onOpen={onOpen} onAdd={onAdd} favorites={favorites} allMemories={memoryItems}/>)}
        {activeSection==='My List' && favoriteItems.length===0 && <div className="empty-collection"><Heart/><h2>Your list is waiting.</h2><p>Save a memory with the + button and it will appear here.</p><button className="secondary-btn" onClick={()=>onNavigate('Memories')}>Explore memories</button></div>}
        {isLanding && <><section className="special-strip" id="our-story"><div><p className="eyebrow">A STORY THAT'S OURS</p><h2>Every moment.<br/><em>Every chapter.</em></h2><p className="muted">The story is still being written. This is where we keep the pages.</p><button className="text-btn" onClick={()=>onNavigate('Our Story')}>Explore Our Story <span>→</span></button></div><div className="strip-art">✦</div></section><section className="bottom-links" id="categories"><button onClick={()=>onNavigate('Memories')}><ImageIcon/><span>Memory Library</span></button><button onClick={()=>onNavigate('Categories')}><Heart/><span>Browse Categories</span></button><button onClick={()=>onNavigate('Our Story')}><CalendarDays/><span>Our Timeline</span></button><button onClick={()=>onToast('Soundtracks will be connected with the media library later.')}><Music2/><span>Our Soundtrack</span></button></section></>}
      </div></main>
    {showNewArrival && highlight && <div className="new-arrival-overlay" role="dialog" aria-label="Newly added highlight"><div className="new-arrival-backdrop" style={{backgroundImage:`linear-gradient(90deg,#050505 0%,#050505aa 45%,transparent 100%),linear-gradient(0deg,#050505 0%,transparent 65%),url("${highlight.background_url || highlight.image}")`}}/><div className="new-arrival-copy"><p className="eyebrow"><Sparkles size={14}/> NEW &amp; HIGHLIGHT</p><h2>{highlight.title}</h2><p>{highlight.description}</p><div className="new-arrival-actions"><button className="primary-btn" onClick={()=>{closeNewArrival();onOpen(highlight)}}><Play size={16} fill="currentColor"/> Open now</button><button className="secondary-btn" onClick={closeNewArrival}>Continue browsing</button></div><div className="new-arrival-timer"><span/></div><small>Featured for 10 seconds · Then saved in Newly Added</small></div></div>}
    <footer><span>OUR LITTLE UNIVERSE</span><span>Made of moments. Kept forever.</span><button onClick={onReplay}>REPLAY INTRO</button></footer></div>
}

function Details({ memory, onBack, onAdd, saved, onPlay, onRelated, memoryItems = memories }) {
  if (!memory) return <div className="empty-state"><p>Choose a memory to explore.</p><button className="secondary-btn" onClick={onBack}><ArrowLeft/> Back home</button></div>
  return <main className="details-screen"><button className="back-button" onClick={onBack}><ArrowLeft/> Back to browse</button><div className="details-hero" style={{backgroundImage:`linear-gradient(0deg,#080808 0%,transparent 70%),linear-gradient(90deg,#080808 0%,transparent 100%),url(${memory.background_url || memory.image})`}}/><div className="details-copy"><p className="eyebrow"><span className="red-mark">N</span> OUR LITTLE UNIVERSE ORIGINAL</p><h1>{memory.title}</h1><p className="details-meta"><span className="match">OUR ORIGINAL</span><span>{memory.category}</span><span>{memory.year}</span><span>{memory.duration}</span></p><p className="details-description">{memory.description}</p><div className="hero-actions"><button className="primary-btn" onClick={()=>onPlay(memory)}><Play fill="currentColor"/> Play Memory</button><button className={saved?'secondary-btn saved':'secondary-btn'} onClick={() => onAdd(memory)}>{saved?<Heart fill="currentColor"/>:<Plus/>} My List</button>{memory.external_url && <a className="project-link-btn" href={memory.external_url} target="_blank" rel="noopener noreferrer"><Globe size={17}/> Open project website</a>}</div>{!memory.media_url && <div className="coming-panel"><Film/><div><strong>Memory preview</strong><p>This memory has no uploaded media source yet.</p></div></div>}<section className="related-memories"><h2>More from our universe</h2><div>{memoryItems.filter(item=>item.id!==memory.id).slice(0,4).map(item=><button key={item.id} onClick={()=>onRelated(item)}><img src={item.image} alt=""/><span>{item.title}</span></button>)}</div></section></div></main>
}

function Player({ memory, onClose, onHome }) {
  const videoRef = useRef(null)
  const frameRef = useRef(null)
  const [playing, setPlaying] = useState(true)
  const [muted, setMuted] = useState(true)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [progress, setProgress] = useState(() => Number(localStorage.getItem(`olu-progress-${memory?.id}`) || 0))
  const isVideo = memory?.media_type === 'video' && !!memory?.media_url
  const isAudio = memory?.media_type === 'audio' && !!memory?.media_url
  const formatTime = value => {
    if (!Number.isFinite(value) || value < 0) return '0:00'
    const mins = Math.floor(value / 60)
    const secs = Math.floor(value % 60)
    return `${mins}:${String(secs).padStart(2, '0')}`
  }
  useEffect(() => {
    localStorage.setItem(`olu-progress-${memory?.id}`, String(progress))
  }, [progress, memory?.id])
  useEffect(() => {
    if (!isVideo || !videoRef.current) return
    const video = videoRef.current
    const onLoaded = () => {
      setDuration(video.duration || 0)
      if (progress > 0 && progress < 100 && video.duration) video.currentTime = (progress / 100) * video.duration
      video.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
    }
    const onTime = () => {
      setCurrentTime(video.currentTime || 0)
      if (video.duration) setProgress((video.currentTime / video.duration) * 100)
    }
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    video.addEventListener('loadedmetadata', onLoaded)
    video.addEventListener('timeupdate', onTime)
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    return () => {
      video.removeEventListener('loadedmetadata', onLoaded)
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
    }
  }, [isVideo, memory?.id])
  const togglePlayback = async () => {
    if (!videoRef.current) return
    if (videoRef.current.paused) {
      try { await videoRef.current.play() } catch { setPlaying(false) }
    } else videoRef.current.pause()
  }
  const skip = seconds => {
    if (!videoRef.current) return
    videoRef.current.currentTime = Math.max(0, Math.min(duration || Infinity, videoRef.current.currentTime + seconds))
  }
  const seek = value => {
    const next = Number(value)
    setProgress(next)
    if (videoRef.current && duration) videoRef.current.currentTime = (next / 100) * duration
  }
  const toggleMute = () => {
    const next = !muted
    setMuted(next)
    if (videoRef.current) videoRef.current.muted = next
  }
  const fullscreen = async () => {
    const video = videoRef.current
    const frame = frameRef.current
    if (!video || !frame) return

    // iPhone/iPad Safari uses the native video fullscreen API; a div's
    // requestFullscreen() is not supported consistently there.
    if (video.webkitDisplayingFullscreen) {
      video.webkitExitFullscreen?.()
      return
    }
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      if (document.exitFullscreen) await document.exitFullscreen()
      else document.webkitExitFullscreen?.()
      return
    }
    if (typeof video.webkitEnterFullscreen === 'function') {
      video.webkitEnterFullscreen()
      return
    }

    // Android Chrome and other modern browsers support the standard API.
    const request = frame.requestFullscreen || frame.webkitRequestFullscreen || video.requestFullscreen || video.webkitRequestFullscreen
    if (typeof request === 'function') {
      try {
        await request.call(frame.requestFullscreen || frame.webkitRequestFullscreen ? frame : video, { navigationUI: 'hide' })
      } catch (error) {
        // Older WebKit implementations may reject the options argument.
        try {
          await request.call(frame.requestFullscreen || frame.webkitRequestFullscreen ? frame : video)
        } catch {
          if (typeof video.webkitEnterFullscreen === 'function') video.webkitEnterFullscreen()
          else console.warn('Fullscreen is not supported by this browser.', error)
        }
      }
      return
    }
    if (typeof video.webkitEnterFullscreen === 'function') video.webkitEnterFullscreen()
    else console.warn('Fullscreen is not supported by this browser.')
  }
  return <div className="player-screen" role="dialog" aria-label={`Playing ${memory?.title || 'memory'}`}>
    <div className="player-backdrop" style={{backgroundImage:`linear-gradient(0deg,#050505 0%,#05050566 70%),url(${memory?.background_url || memory?.image})`}}/>
    <header className="player-top">
      <div className="player-navigation">
        <button type="button" onClick={onClose}><ArrowLeft/> <span>Back</span></button>
        <button type="button" onClick={onHome}><HomeIcon/> <span>Home</span></button>
      </div>
      <div className="player-title"><strong>{memory?.title}</strong><small>OUR LITTLE UNIVERSE ORIGINAL</small></div>
    </header>
    <main className="player-main">
      <div className={`player-frame ${isVideo ? 'has-video' : ''}`} ref={frameRef}>
        {isVideo ? <video ref={videoRef} className="real-memory-player" src={memory.media_url} autoPlay muted playsInline preload="metadata" poster={memory.poster_url || memory.image} />
          : isAudio ? <div className="audio-memory-card"><Music2 size={42}/><strong>{memory.title}</strong><audio src={memory.media_url} controls autoPlay/></div>
          : memory?.media_url ? <img className="real-memory-photo" src={memory.media_url} alt={memory.title}/>
          : <div className="player-empty"><Film size={42}/><strong>{memory?.title || 'Your memory film'}</strong><span>No media source is connected to this memory yet.</span></div>}
      </div>
      {isVideo && <section className="cinema-controls" aria-label="Video controls">
        <label className="cinema-progress"><span style={{width:`${progress}%`}}/><input aria-label="Seek video" type="range" min="0" max="100" step="0.1" value={progress} onChange={e=>seek(e.target.value)}/></label>
        <div className="cinema-control-row">
          <button type="button" aria-label="Play or pause" onClick={togglePlayback}>{playing?<Pause fill="currentColor"/>:<Play fill="currentColor"/>}</button>
          <button type="button" aria-label="Back 10 seconds" onClick={()=>skip(-10)}><RotateCcw/><small>10</small></button>
          <button type="button" aria-label="Forward 10 seconds" onClick={()=>skip(10)}><SkipForward/><small>10</small></button>
          <button type="button" aria-label={muted?'Unmute':'Mute'} onClick={toggleMute}>{muted?<VolumeX/>:<Volume2/>}</button>
          <span className="cinema-time">{formatTime(currentTime)} <i>/ {formatTime(duration)}</i></span>
          <span className="player-spacer"/>
          <button type="button" aria-label="Fullscreen" onClick={fullscreen}><Maximize/></button>
        </div>
      </section>}
    </main>
  </div>
}

function SearchOverlay({ onClose, onOpen, memoryItems = memories }) {
  const [query,setQuery] = useState('')
  const results = useMemo(() => memoryItems.filter(m => `${m.title} ${m.category} ${m.description}`.toLowerCase().includes(query.toLowerCase())),[query])
  return <div className="search-overlay"><div className="search-top"><Search/><input autoFocus placeholder="Search memories, places, moments..." value={query} onChange={e=>setQuery(e.target.value)}/><button onClick={onClose}><X/></button></div>{query ? <><p className="search-label">{results.length} RESULTS FOR “{query.toUpperCase()}”</p><div className="search-results">{results.map(m=><button key={m.id} className="search-result" onClick={()=>onOpen(m)}><img src={m.image} alt=""/><span><strong>{m.title}</strong><small>{m.category}</small></span><Play size={16}/></button>)}{!results.length && <p className="muted">No memories found. Try another search.</p>}</div></>:<p className="search-hint">Search your moments, places and little stories.</p>}</div>
}

function readSaved(key, fallback) {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback } catch { return fallback }
}

export default function App() {
  const [stage,setStage] = useState(() => localStorage.getItem('olu-intro-seen') ? 'login' : 'intro')
  const [authUser,setAuthUser] = useState(null)
  const [profile,setProfile] = useState(null)
  const [memoryItems,setMemoryItems] = useState(memories)
  const [siteSettings,setSiteSettings] = useState(null)
  const [profileCategories,setProfileCategories] = useState([])

  useEffect(() => {
    if (!isSupabaseConfigured) return
    let alive = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return
      const user = data.session?.user || null
      setAuthUser(user)
      if (user && hasRole(user, 'admin')) setStage('admin')
      else if (user && hasRole(user, 'viewer')) {
        const pid = user.app_metadata?.profile_id
        if (pid) {
          const { data: p } = await supabase.from('profiles').select('*').eq('id', pid).single()
          if (alive && p) { setProfile(p); await loadProfileMemories(pid); setStage('home') }
        }
      }
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user || null
      setAuthUser(user)
      if (!user) setStage(current => current === 'intro' ? 'intro' : 'login')
    })
    return () => { alive = false; listener.subscription.unsubscribe() }
  }, [])
  const [selected,setSelected] = useState(null)
  const [favorites,setFavorites] = useState(() => readSaved('olu-favorites-you', []))
  const [favoriteProfileId,setFavoriteProfileId] = useState('you')
  const [searchOpen,setSearchOpen] = useState(false)
  const [playerMemory,setPlayerMemory] = useState(null)
  useEffect(() => {
    if (!playerMemory) return
    window.history.pushState({ ...(window.history.state || {}), oluPlayer: true }, '')
    const handlePlayerBack = () => setPlayerMemory(null)
    window.addEventListener('popstate', handlePlayerBack)
    return () => window.removeEventListener('popstate', handlePlayerBack)
  }, [!!playerMemory])
  const [activeSection,setActiveSection] = useState('Home')
  const [toast,setToast] = useState('')
  const loadSiteSettings = async (profileId) => {
    if (!supabase || !profileId) { setSiteSettings(null); return }
    const { data, error } = await supabase.from('profile_site_settings').select('*').eq('profile_id', profileId).maybeSingle()
    if (error) {
      console.warn('Profile homepage settings are unavailable. Apply migration 005.', error.message)
      setSiteSettings(null)
      return
    }
    if (!data) { setSiteSettings(null); return }
    let hero_background_url = '', hero_background_video_url = ''
    if (data.hero_background_path) {
      const { data: signed, error: signedError } = await supabase.storage.from('memory-media').createSignedUrl(data.hero_background_path, 3600)
      if (!signedError) hero_background_url = signed?.signedUrl || ''
    }
    if (data.hero_background_video_path) {
      const { data: signed, error: signedError } = await supabase.storage.from('memory-media').createSignedUrl(data.hero_background_video_path, 3600)
      if (!signedError) hero_background_video_url = signed?.signedUrl || ''
    }
    setSiteSettings({ ...data, hero_background_url, hero_background_video_url })
  }
  const loadProfileMemories = async profileId => {
    if (!supabase || !profileId) { setMemoryItems([]); return }
    const { data: profileRow } = await supabase.from('profiles').select('cover_path,avatar_path').eq('id', profileId).single()
    if (profileRow) {
      const [cover, avatar] = await Promise.all([
        profileRow.cover_path ? supabase.storage.from('memory-media').createSignedUrl(profileRow.cover_path, 1800) : Promise.resolve({data:null}),
        profileRow.avatar_path ? supabase.storage.from('memory-media').createSignedUrl(profileRow.avatar_path, 1800) : Promise.resolve({data:null})
      ])
      setProfile(current => current ? { ...current, cover_url: cover.data?.signedUrl || '', avatar_url: avatar.data?.signedUrl || '' } : current)
    }
    const { data, error } = await supabase.from('memories').select('id,title,description,category,category_id,media_type,media_path,poster_path,memory_background_path,external_url,is_highlighted,created_at,profile_memories!inner(profile_id,profile_category_id,is_highlighted,profile_categories(name,poster_path,background_path,background_video_path,description))').eq('profile_memories.profile_id', profileId).order('created_at', { ascending: false })
    if (error) { console.error(error); setMemoryItems([]); return }
    const mapped = await Promise.all((data || []).map(async m => {
      const relation = m.profile_memories?.[0]?.profile_categories
      const [media, poster, background, categoryPoster, categoryBackground, categoryBackgroundVideo] = await Promise.all([
        m.media_path ? supabase.storage.from('memory-media').createSignedUrl(m.media_path, 1800) : Promise.resolve({data:null}),
        m.poster_path ? supabase.storage.from('memory-media').createSignedUrl(m.poster_path, 1800) : Promise.resolve({data:null}),
        m.memory_background_path ? supabase.storage.from('memory-media').createSignedUrl(m.memory_background_path, 1800) : Promise.resolve({data:null}),
        relation?.poster_path ? supabase.storage.from('memory-media').createSignedUrl(relation.poster_path, 1800) : Promise.resolve({data:null}),
        relation?.background_path ? supabase.storage.from('memory-media').createSignedUrl(relation.background_path, 1800) : Promise.resolve({data:null}),
        relation?.background_video_path ? supabase.storage.from('memory-media').createSignedUrl(relation.background_video_path, 1800) : Promise.resolve({data:null})
      ])
      const profileCategory = relation?.name
      return { ...m, is_highlighted: !!m.profile_memories?.[0]?.is_highlighted, category: profileCategory || m.category || 'Uncategorized', image: poster.data?.signedUrl || (m.media_type === 'photo' ? media.data?.signedUrl : null) || background.data?.signedUrl || categoryPoster.data?.signedUrl || 'https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?w=900&q=85', media_url: media.data?.signedUrl || '', background_url: background.data?.signedUrl || categoryBackground.data?.signedUrl || '', category_background_video_url: categoryBackgroundVideo.data?.signedUrl || '', year: m.created_at ? new Date(m.created_at).getFullYear().toString() : '', duration: m.media_type?.toUpperCase() || 'MEMORY' }
    }))
    setMemoryItems(mapped)
    const { data: categoryRows, error: categoryError } = await supabase.from('profile_categories').select('*').eq('profile_id', profileId).order('sort_order').order('name')
    if (categoryError) { console.error('Profile categories unavailable', categoryError.message); setProfileCategories([]) }
    else {
      const categoryItems = await Promise.all((categoryRows || []).map(async c => {
        const [poster, background, backgroundVideo] = await Promise.all([
          c.poster_path ? supabase.storage.from('memory-media').createSignedUrl(c.poster_path, 1800) : Promise.resolve({data:null}),
          c.background_path ? supabase.storage.from('memory-media').createSignedUrl(c.background_path, 1800) : Promise.resolve({data:null}),
          c.background_video_path ? supabase.storage.from('memory-media').createSignedUrl(c.background_video_path, 1800) : Promise.resolve({data:null})
        ])
        return { ...c, poster_url: poster.data?.signedUrl || '', background_url: background.data?.signedUrl || '', background_video_url: backgroundVideo.data?.signedUrl || '' }
      }))
      setProfileCategories(categoryItems)
    }
    await loadSiteSettings(profileId)
  }
  useEffect(()=>{ if(profile && favoriteProfileId===profile.id) localStorage.setItem(`olu-favorites-${profile.id}`, JSON.stringify(favorites)) },[favorites,profile,favoriteProfileId])
  useEffect(()=>{ if(!toast) return; const timer=window.setTimeout(()=>setToast(''),2600); return ()=>window.clearTimeout(timer) },[toast])
  const finishIntro = () => {localStorage.setItem('olu-intro-seen','1');setStage('login')}
  const toggleFavorite = memory => {
    const already = favorites.includes(memory.id)
    setFavorites(old => already ? old.filter(id=>id!==memory.id) : [...old,memory.id])
    setToast(already ? 'Removed from My List' : 'Added to My List')
  }
  const navigate = section => { setSelected(null); setActiveSection(section); window.scrollTo({top:0,behavior:'smooth'}) }
  if (stage === 'intro') return <Intro onDone={finishIntro}/>
  if (stage === 'login') return <Login
    onEnter={async ({ user, profile: p }) => { setAuthUser(user); setProfile(p); setFavorites(readSaved(`olu-favorites-${p.id}`, [])); setFavoriteProfileId(p.id); await loadProfileMemories(p.id); setStage('home') }}
    onAdmin={user => { setAuthUser(user); setStage('admin') }}
    onReplay={()=>setStage('intro')}
  />
  if (stage === 'profiles') return <Login onEnter={({user,profile:p})=>{setAuthUser(user);setProfile(p);setStage('home')}} onAdmin={user=>{setAuthUser(user);setStage('admin')}} onReplay={()=>setStage('intro')}/>
  if (stage === 'admin') return <AdminDashboard onSignOut={async()=>{ if (supabase) await supabase.auth.signOut(); setAuthUser(null); setProfile(null); setStage('login') }}/>
  return <>{selected ? <Details memory={selected} onBack={()=>setSelected(null)} onAdd={toggleFavorite} saved={favorites.includes(selected.id)} onPlay={setPlayerMemory} onRelated={setSelected} memoryItems={memoryItems}/> : <Home profile={profile} siteSettings={siteSettings} profileCategories={profileCategories} onProfile={async()=>{await supabase?.auth.signOut();setProfile(null);setStage('login')}} onAdmin={()=>setStage('login')} onOpen={setSelected} favorites={favorites} onAdd={toggleFavorite} onSearch={()=>setSearchOpen(true)} onReplay={()=>setStage('intro')} onNavigate={navigate} activeSection={activeSection} onToast={setToast} memoryItems={memoryItems}/>} {searchOpen && <SearchOverlay memoryItems={memoryItems} onClose={()=>setSearchOpen(false)} onOpen={m=>{setSelected(m);setSearchOpen(false)}}/>}{playerMemory && <Player memory={playerMemory} onClose={()=>{setPlayerMemory(null);if(window.history.state?.oluPlayer)window.history.back()}} onHome={()=>{setPlayerMemory(null);if(window.history.state?.oluPlayer)window.history.back();setSelected(null);setSearchOpen(false);window.scrollTo({top:0,behavior:"smooth"})}}/>} {toast && <div className="olu-toast"><Check size={16}/>{toast}</div>}</>
}
