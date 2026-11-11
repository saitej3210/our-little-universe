import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { Users, Upload, Image as ImageIcon, Film, Trash2, LogOut, Plus, RefreshCw, FolderPlus, Sparkles, Globe } from 'lucide-react'

const BUCKET = 'memory-media'
const emptyProfile = { name: '', password: '', accent_color: '#8b4962' }
const defaultSiteForm = { hero_title: 'A little world', hero_emphasis: 'of our own.', hero_subtitle: 'The moments, places and people that make this profile special.', hero_kicker: 'A PRIVATE COLLECTION', hero_collection_label: 'PERSONAL MEMORIES', hero_type_label: 'MADE JUST FOR YOU', hero_background_path: '' }

export default function AdminDashboard({ onSignOut }) {
  const [profiles, setProfiles] = useState([])
  const [memories, setMemories] = useState([])
  const [profileCategories, setProfileCategories] = useState([])
  const [tab, setTab] = useState('profiles')
  const [siteForm, setSiteForm] = useState(defaultSiteForm)
  const [profileSettings, setProfileSettings] = useState([])
  const [selectedExperienceProfileId, setSelectedExperienceProfileId] = useState('')
  const [heroPreview, setHeroPreview] = useState('')
  const [heroVideoPreview, setHeroVideoPreview] = useState('')
  const [form, setForm] = useState(emptyProfile)
  const [media, setMedia] = useState({ title: '', description: '', category: 'Our Story', profileIds: [], file: null, poster: null, background: null, external_url: '', is_highlighted: true })
  const [categoryForm, setCategoryForm] = useState({ profile_id: '', name: '', description: '', poster: null, background: null, backgroundVideo: null })
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [passwordDrafts, setPasswordDrafts] = useState({})
  const [nameDrafts, setNameDrafts] = useState({})
  const [error, setError] = useState('')

  const load = async () => {
    setError('')
    const [p, m, settings, cats] = await Promise.all([
      supabase.from('profiles').select('id,name,avatar_path,cover_path,accent_color,login_email,created_at').order('created_at'),
      supabase.from('memories').select('id,title,description,category,category_id,media_path,poster_path,memory_background_path,external_url,media_type,is_highlighted,created_at,profile_memories(profile_id,profile_category_id,is_highlighted)').order('created_at', { ascending: false }),
      supabase.from('profile_site_settings').select('*'),
      supabase.from('profile_categories').select('*').order('sort_order').order('name')
    ])
    if (p.error) setError(p.error.message); else {
      const rows = p.data || []
      const withUrls = await Promise.all(rows.map(async row => {
        const [cover, avatar] = await Promise.all([
          row.cover_path ? supabase.storage.from(BUCKET).createSignedUrl(row.cover_path, 3600) : Promise.resolve({ data: null }),
          row.avatar_path ? supabase.storage.from(BUCKET).createSignedUrl(row.avatar_path, 3600) : Promise.resolve({ data: null })
        ])
        return { ...row, cover_url: cover.data?.signedUrl || '', avatar_url: avatar.data?.signedUrl || '' }
      }))
      setProfiles(withUrls)
      if (!selectedExperienceProfileId && withUrls[0]?.id) setSelectedExperienceProfileId(withUrls[0].id)
    }
    if (m.error) setError(m.error.message); else setMemories(m.data || [])
    if (settings.error) setError(`Profile homepage settings are unavailable. Apply migrations 005 and 006: ${settings.error.message}`)
    else setProfileSettings(settings.data || [])
    if (cats.error) setError(`Profile categories are unavailable. Apply migration 006: ${cats.error.message}`)
    else {
      const categoryRows = await Promise.all((cats.data || []).map(async c => {
        const [poster, background, backgroundVideo] = await Promise.all([
          c.poster_path ? supabase.storage.from(BUCKET).createSignedUrl(c.poster_path, 3600) : Promise.resolve({ data: null }),
          c.background_path ? supabase.storage.from(BUCKET).createSignedUrl(c.background_path, 3600) : Promise.resolve({ data: null }),
          c.background_video_path ? supabase.storage.from(BUCKET).createSignedUrl(c.background_video_path, 3600) : Promise.resolve({ data: null })
        ])
        return { ...c, poster_url: poster.data?.signedUrl || '', background_url: background.data?.signedUrl || '', background_video_url: backgroundVideo.data?.signedUrl || '' }
      }))
      setProfileCategories(categoryRows)
      if (!categoryForm.profile_id && p.data?.[0]?.id) setCategoryForm(old => ({ ...old, profile_id: p.data[0].id }))
    }
  }
  useEffect(() => { load() }, [])

  useEffect(() => {
    if (!selectedExperienceProfileId) return
    const row = profileSettings.find(item => item.profile_id === selectedExperienceProfileId)
    const next = { ...defaultSiteForm, ...(row || {}) }
    setSiteForm(next)
    let active = true
    if (row?.hero_background_path) {
      supabase.storage.from(BUCKET).createSignedUrl(row.hero_background_path, 3600).then(({ data }) => { if (active) setHeroPreview(data?.signedUrl || '') })
    } else setHeroPreview('')
    if (row?.hero_background_video_path) {
      supabase.storage.from(BUCKET).createSignedUrl(row.hero_background_video_path, 3600).then(({ data }) => { if (active) setHeroVideoPreview(data?.signedUrl || '') })
    } else setHeroVideoPreview('')
    return () => { active = false }
  }, [selectedExperienceProfileId, profileSettings])

  const uploadFile = async (file, path) => {
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true, contentType: file.type || undefined })
    if (uploadError) throw uploadError
    return path
  }

  const createProfile = async e => {
    e.preventDefault(); setBusy(true); setError(''); setNotice('')
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('admin-create-profile', {
        body: { name: form.name.trim(), password: form.password, accent_color: form.accent_color }
      })
      if (invokeError) throw invokeError
      if (data?.error) throw new Error(data.error)
      setForm(emptyProfile); setNotice('Profile created. Its individual password is ready.')
      await load()
    } catch (err) { setError(err.message || 'Could not create profile.') }
    finally { setBusy(false) }
  }

  const uploadCover = async (profile, file) => {
    if (!file) return
    setBusy(true); setError(''); setNotice('')
    try {
      const ext = file.name.split('.').pop().toLowerCase()
      const path = `profiles/${profile.id}/cover-${Date.now()}.${ext}`
      await uploadFile(file, path)
      const { error: updateError } = await supabase.from('profiles').update({ cover_path: path }).eq('id', profile.id)
      if (updateError) throw updateError
      setNotice(`Cover updated for ${profile.name}.`); await load()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const uploadAvatar = async (profile, file) => {
    if (!file) return
    setBusy(true); setError(''); setNotice('')
    try {
      const ext = file.name.split('.').pop().toLowerCase()
      const path = `profiles/${profile.id}/avatar-${Date.now()}.${ext}`
      await uploadFile(file, path)
      const { error: updateError } = await supabase.from('profiles').update({ avatar_path: path }).eq('id', profile.id)
      if (updateError) throw updateError
      setNotice(`Profile picture updated for ${profile.name}.`); await load()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const saveMemory = async e => {
    e.preventDefault()
    if (!media.file || !media.title.trim() || media.profileIds.length === 0 || !media.category.trim()) {
      setError('Choose a media file, enter a title and category, and assign it to at least one profile.'); return
    }
    setBusy(true); setError(''); setNotice('')
    try {
      const ext = media.file.name.split('.').pop().toLowerCase()
      const id = crypto.randomUUID()
      const path = `memories/${id}/original-${Date.now()}.${ext}`
      await uploadFile(media.file, path)
      let posterPath = null
      if (media.poster) {
        const pext = media.poster.name.split('.').pop().toLowerCase()
        posterPath = `memories/${id}/poster-${Date.now()}.${pext}`
        await uploadFile(media.poster, posterPath)
      }
      let backgroundPath = null
      if (media.background) {
        const bext = media.background.name.split('.').pop().toLowerCase()
        backgroundPath = `memories/${id}/background-${Date.now()}.${bext}`
        await uploadFile(media.background, backgroundPath)
      }
      const type = media.file.type.startsWith('video/') ? 'video' : media.file.type.startsWith('audio/') ? 'audio' : 'photo'
      let externalUrl = null
      if (media.external_url.trim()) {
        const parsed = new URL(media.external_url.trim())
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Website URL must start with http:// or https://')
        externalUrl = parsed.toString()
      }
      const { data: legacyCategory, error: legacyCategoryError } = await supabase.from('categories').upsert({ name: media.category.trim() }, { onConflict: 'name' }).select('id').single()
      if (legacyCategoryError) throw legacyCategoryError
      const { data: memory, error: memoryError } = await supabase.from('memories').insert({
        id, title: media.title.trim(), description: media.description, category: media.category.trim(), category_id: legacyCategory.id,
        media_path: path, poster_path: posterPath, memory_background_path: backgroundPath, external_url: externalUrl,
        media_type: type, is_highlighted: !!media.is_highlighted, is_published: true
      }).select('id').single()
      if (memoryError) throw memoryError
      const links = []
      for (const profile_id of media.profileIds) {
        const { data: category, error: categoryError } = await supabase.from('profile_categories')
          .upsert({ profile_id, name: media.category.trim() }, { onConflict: 'profile_id,name' }).select('id').single()
        if (categoryError) throw categoryError
        links.push({ profile_id, memory_id: memory.id, profile_category_id: category.id, is_highlighted: !!media.is_highlighted })
      }
      const { error: linkError } = await supabase.from('profile_memories').insert(links)
      if (linkError) throw linkError
      setMedia({ title: '', description: '', category: 'Our Story', profileIds: [], file: null, poster: null, background: null, external_url: '', is_highlighted: true })
      setNotice('Memory uploaded. It is assigned to the selected profiles and appears in Newly Added.')
      await load()
    } catch (err) { setError(err.message || 'Upload failed.') } finally { setBusy(false) }
  }

  const saveCategory = async e => {
    e.preventDefault()
    if (!categoryForm.profile_id || !categoryForm.name.trim()) return setError('Choose a profile and enter a category name.')
    setBusy(true); setError(''); setNotice('')
    try {
      const id = crypto.randomUUID()
      let poster_path = null, background_path = null, background_video_path = null
      if (categoryForm.poster) {
        const ext = categoryForm.poster.name.split('.').pop().toLowerCase()
        poster_path = `profiles/${categoryForm.profile_id}/categories/${id}/poster-${Date.now()}.${ext}`
        await uploadFile(categoryForm.poster, poster_path)
      }
      if (categoryForm.background) {
        const ext = categoryForm.background.name.split('.').pop().toLowerCase()
        background_path = `profiles/${categoryForm.profile_id}/categories/${id}/background-${Date.now()}.${ext}`
        await uploadFile(categoryForm.background, background_path)
      }
      if (categoryForm.backgroundVideo) {
        if (!categoryForm.backgroundVideo.type.startsWith('video/')) throw new Error('Choose a video file for the category background.')
        const ext = categoryForm.backgroundVideo.name.split('.').pop().toLowerCase()
        background_video_path = `profiles/${categoryForm.profile_id}/categories/${id}/background-${Date.now()}.${ext}`
        await uploadFile(categoryForm.backgroundVideo, background_video_path)
      }
      const { error: categoryError } = await supabase.from('profile_categories').upsert({
        profile_id: categoryForm.profile_id, name: categoryForm.name.trim(), description: categoryForm.description,
        ...(poster_path ? { poster_path } : {}), ...(background_path ? { background_path } : {}), ...(background_video_path ? { background_video_path } : {})
      }, { onConflict: 'profile_id,name' })
      if (categoryError) throw categoryError
      setCategoryForm(old => ({ ...old, name: '', description: '', poster: null, background: null, backgroundVideo: null }))
      setNotice('Category saved for this profile only.')
      await load()
    } catch (err) { setError(err.message || 'Could not save category.') } finally { setBusy(false) }
  }

  const deleteCategory = async category => {
    if (!window.confirm(`Delete category "${category.name}" from this profile? Existing memories will remain, but may become uncategorized.`)) return
    setBusy(true); setError(''); setNotice('')
    try {
      const { error: deleteError } = await supabase.from('profile_categories').delete().eq('id', category.id)
      if (deleteError) throw deleteError
      setNotice('Category deleted from this profile.')
      await load()
    } catch (err) { setError(err.message || 'Could not delete category.') } finally { setBusy(false) }
  }

  const deleteMemory = async memory => {
    if (!window.confirm(`Delete "${memory.title}" and its media?`)) return
    setBusy(true); setError(''); setNotice('')
    try {
      const paths = [memory.media_path, memory.poster_path, memory.memory_background_path].filter(Boolean)
      if (paths.length) {
        const { error: storageError } = await supabase.storage.from(BUCKET).remove(paths)
        if (storageError) throw storageError
      }
      const { error: deleteError } = await supabase.from('memories').delete().eq('id', memory.id)
      if (deleteError) throw deleteError
      setNotice('Memory deleted.'); await load()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }



  const renameProfile = async profile => {
    const name = (nameDrafts[profile.id] || '').trim()
    if (!name) return setError('Enter a profile name.')
    setBusy(true); setError(''); setNotice('')
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('admin-create-profile', { body: { action: 'name', profileId: profile.id, name } })
      if (invokeError) throw invokeError
      if (data?.error) throw new Error(data.error)
      setNameDrafts(old => ({ ...old, [profile.id]: '' }))
      setNotice('Profile name updated.'); await load()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const changePassword = async profile => {
    const password = passwordDrafts[profile.id] || ''
    if (password.length < 8) return setError('New password must contain at least 8 characters.')
    setBusy(true); setError(''); setNotice('')
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('admin-create-profile', { body: { action: 'password', profileId: profile.id, password } })
      if (invokeError) throw invokeError
      if (data?.error) throw new Error(data.error)
      setPasswordDrafts(old => ({ ...old, [profile.id]: '' }))
      setNotice(`Password updated for ${profile.name}.`)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  const deleteProfile = async profile => {
    if (!window.confirm(`Delete profile "${profile.name}" and its login? Its assigned memories will remain in the library but become unassigned.`)) return
    setBusy(true); setError(''); setNotice('')
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('admin-create-profile', { body: { action: 'delete', profileId: profile.id } })
      if (invokeError) throw invokeError
      if (data?.error) throw new Error(data.error)
      setNotice(`Deleted ${profile.name}.`); await load()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const signed = async path => {
    if (!path) return ''
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300)
    return data?.signedUrl || ''
  }

  const saveExperience = async e => {
    e.preventDefault()
    if (!selectedExperienceProfileId) return setError('Create a viewer profile before editing its homepage.')
    setBusy(true); setError(''); setNotice('')
    try {
      const payload = { profile_id: selectedExperienceProfileId, ...siteForm, updated_at: new Date().toISOString() }
      const { error: saveError } = await supabase.from('profile_site_settings').upsert(payload, { onConflict: 'profile_id' })
      if (saveError) throw saveError
      setNotice(`Homepage saved for ${profiles.find(p => p.id === selectedExperienceProfileId)?.name || 'selected profile'}.`)
      await load()
    } catch (err) { setError(err.message || 'Could not save profile homepage settings.') } finally { setBusy(false) }
  }

  const uploadHeroBackground = async file => {
    if (!file) return
    if (!selectedExperienceProfileId) return setError('Choose a profile first.')
    if (!file.type.startsWith('image/')) return setError('Choose an image file for the homepage background.')
    setBusy(true); setError(''); setNotice('')
    try {
      const ext = file.name.split('.').pop().toLowerCase()
      const path = `profiles/${selectedExperienceProfileId}/homepage/hero-${Date.now()}.${ext}`
      await uploadFile(file, path)
      const next = { ...siteForm, hero_background_path: path }
      const { error: saveError } = await supabase.from('profile_site_settings').upsert({ profile_id: selectedExperienceProfileId, ...next, updated_at: new Date().toISOString() }, { onConflict: 'profile_id' })
      if (saveError) throw saveError
      setSiteForm(next)
      const preview = await signed(path)
      setHeroPreview(preview)
      setNotice('Homepage background updated for the selected profile.')
      await load()
    } catch (err) { setError(err.message || 'Background upload failed.') } finally { setBusy(false) }
  }

  const uploadHeroBackgroundVideo = async file => {
    if (!file) return
    if (!selectedExperienceProfileId) return setError('Choose a profile first.')
    if (!file.type.startsWith('video/')) return setError('Choose a video file for the homepage background.')
    setBusy(true); setError(''); setNotice('')
    try {
      const ext = file.name.split('.').pop().toLowerCase()
      const path = `profiles/${selectedExperienceProfileId}/homepage/hero-video-${Date.now()}.${ext}`
      await uploadFile(file, path)
      const next = { ...siteForm, hero_background_video_path: path }
      const { error: saveError } = await supabase.from('profile_site_settings').upsert({ profile_id: selectedExperienceProfileId, ...next, updated_at: new Date().toISOString() }, { onConflict: 'profile_id' })
      if (saveError) throw saveError
      setSiteForm(next)
      const preview = await signed(path)
      setHeroVideoPreview(preview)
      setNotice('Homepage background video updated for the selected profile.')
      await load()
    } catch (err) { setError(err.message || 'Background video upload failed.') } finally { setBusy(false) }
  }

  return <main className="admin-v5">
    <header className="admin-v5-head"><div><p className="eyebrow">PRIVATE CONTROL ROOM · V9</p><h1>Make it <em>ours.</em></h1><p>Manage profiles, their covers and the memories they can see.</p></div><button className="secondary-btn" onClick={onSignOut}><LogOut size={16}/> Sign out</button></header>
    <nav className="admin-v5-tabs"><button className={tab==='profiles'?'active':''} onClick={()=>setTab('profiles')}><Users size={16}/> Profiles</button><button className={tab==='upload'?'active':''} onClick={()=>setTab('upload')}><Upload size={16}/> Add memories</button><button className={tab==='categories'?'active':''} onClick={()=>setTab('categories')}><FolderPlus size={16}/> Categories</button><button className={tab==='library'?'active':''} onClick={()=>setTab('library')}><Film size={16}/> Media library</button><button className={tab==='experience'?'active':''} onClick={()=>setTab('experience')}><ImageIcon size={16}/> Homepage design</button><button onClick={load}><RefreshCw size={15}/> Refresh</button></nav>
    {notice && <p className="admin-success">{notice}</p>}{error && <p className="admin-error">{error}</p>}
    {tab==='profiles' && <section className="admin-v5-section"><div className="admin-v5-title"><div><h2>Viewer profiles</h2><p>Every profile has its own Supabase login and password.</p></div><span>{profiles.length} PROFILES</span></div>
      <form className="admin-profile-form" onSubmit={createProfile}><h3><Plus size={17}/> Create profile</h3><label>Profile name<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. Saiteja"/></label><label>Individual password<input required minLength="8" type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder="At least 8 characters"/></label><label>Accent colour<input type="color" value={form.accent_color} onChange={e=>setForm({...form,accent_color:e.target.value})}/></label><button className="primary-btn" disabled={busy}>{busy?'Creating…':'Create profile'}</button><small>Requires the included admin-create-profile Edge Function to be deployed.</small></form>
      <div className="admin-profile-grid">{profiles.map(p=><article className="admin-profile-card" key={p.id}><div className="profile-cover-preview" style={{backgroundImage:p.cover_url?`linear-gradient(0deg,#000b,transparent),url("${p.cover_url}")`:'linear-gradient(135deg,#30232c,#101010)'}}><strong>{p.name}</strong></div><div className="profile-assets"><label>Profile picture<input type="file" accept="image/*" onChange={e=>uploadAvatar(p,e.target.files?.[0])}/></label><label>Cover background<input type="file" accept="image/*" onChange={e=>uploadCover(p,e.target.files?.[0])}/></label></div><small>{p.login_email || 'Profile login configured'}</small><div className="profile-password-tools"><input placeholder="Rename profile" value={nameDrafts[p.id] || ''} onChange={e=>setNameDrafts({...nameDrafts,[p.id]:e.target.value})}/><button className="secondary-btn" onClick={()=>renameProfile(p)} disabled={busy}>Save name</button><input type="password" minLength="8" placeholder="Set new password" value={passwordDrafts[p.id] || ''} onChange={e=>setPasswordDrafts({...passwordDrafts,[p.id]:e.target.value})}/><button className="secondary-btn" onClick={()=>changePassword(p)} disabled={busy}>Update password</button><button className="danger-btn" onClick={()=>deleteProfile(p)} disabled={busy}><Trash2 size={14}/> Delete profile</button></div></article>)}</div>
    </section>}
    {tab==='upload' && <section className="admin-v5-section"><div className="admin-v5-title"><div><h2>Add a memory</h2><p>Upload a photo, video or audio file. Choose a profile-specific category such as My Websites & AI Creations, add its poster/background, and optionally feature it for 10 seconds.</p></div></div><form className="admin-upload-form" onSubmit={saveMemory}><label>Memory title<input required value={media.title} onChange={e=>setMedia({...media,title:e.target.value})} placeholder="A little moment worth keeping"/></label><label>Description<textarea value={media.description} onChange={e=>setMedia({...media,description:e.target.value})} placeholder="Add a short story..."/></label><label>Website / project URL (optional)<input type="url" value={media.external_url} onChange={e=>setMedia({...media,external_url:e.target.value})} placeholder="https://your-project.example"/><small>For birthday websites, AI-made websites and other interactive projects.</small></label><label>Profile-specific category<input list="profile-category-options" required value={media.category} onChange={e=>setMedia({...media,category:e.target.value})} placeholder="Choose or type a category"/><datalist id="profile-category-options">{profileCategories.filter(c=>media.profileIds.includes(c.profile_id)).map(c=><option key={c.id} value={c.name}/>)}</datalist><small>The same category name is created separately inside each selected profile.</small></label><label>Photo / video / audio<input required type="file" accept="image/*,video/*,audio/*" onChange={e=>setMedia({...media,file:e.target.files?.[0] || null})}/></label><label>Optional poster / thumbnail<input type="file" accept="image/*" onChange={e=>setMedia({...media,poster:e.target.files?.[0] || null})}/></label><label>Optional cinematic background image<input type="file" accept="image/*" onChange={e=>setMedia({...media,background:e.target.files?.[0] || null})}/></label><label className="highlight-toggle"><input type="checkbox" checked={media.is_highlighted} onChange={e=>setMedia({...media,is_highlighted:e.target.checked})}/> Feature this in New &amp; Highlight for 10 seconds when its profile opens</label><fieldset><legend>Assign to profiles</legend>{profiles.map(p=><label className="profile-check" key={p.id}><input type="checkbox" checked={media.profileIds.includes(p.id)} onChange={e=>setMedia({...media,profileIds:e.target.checked?[...media.profileIds,p.id]:media.profileIds.filter(id=>id!==p.id)})}/>{p.name}</label>)}</fieldset><button className="primary-btn" disabled={busy}>{busy?'Uploading…':'Upload memory'}</button></form></section>}
    {tab==='categories' && <section className="admin-v5-section"><div className="admin-v5-title"><div><h2>Profile categories</h2><p>Create separate collections for each profile. Website and AI creations have their own starter category.</p></div></div><form className="admin-upload-form" onSubmit={saveCategory}><label>Profile<select value={categoryForm.profile_id} onChange={e=>setCategoryForm({...categoryForm,profile_id:e.target.value})}>{profiles.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Category name<input required value={categoryForm.name} onChange={e=>setCategoryForm({...categoryForm,name:e.target.value})} placeholder="e.g. My Websites & AI Creations"/></label><label>Description<textarea value={categoryForm.description} onChange={e=>setCategoryForm({...categoryForm,description:e.target.value})} placeholder="What belongs in this collection?"/></label><label>Category poster<input type="file" accept="image/*" onChange={e=>setCategoryForm({...categoryForm,poster:e.target.files?.[0] || null})}/></label><label>Category background image<input type="file" accept="image/*" onChange={e=>setCategoryForm({...categoryForm,background:e.target.files?.[0] || null})}/></label><label>Category background video (MP4 / WebM)<input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={e=>setCategoryForm({...categoryForm,backgroundVideo:e.target.files?.[0] || null})}/><small>Muted, looping cinematic background. Keep the file reasonably compressed for mobile data.</small></label><button className="primary-btn" disabled={busy}>{busy?'Saving…':'Create / update category'}</button></form><div className="category-admin-grid">{profileCategories.filter(c=>c.profile_id===categoryForm.profile_id).map(c=><article key={c.id} className="category-admin-card"><div className="category-admin-art" style={{backgroundImage:c.poster_url?`linear-gradient(0deg,#000a,transparent),url("${c.poster_url}")`:undefined}}><strong>{c.name}</strong></div><p>{c.description || 'No description yet.'}</p>{c.background_url && <small>Custom background image saved</small>}{c.background_video_url && <small>Category background video saved</small>}<button className="danger-btn" onClick={()=>deleteCategory(c)} disabled={busy}><Trash2 size={14}/> Delete category</button></article>)}</div></section>}
    {tab==='experience' && <section className="admin-v5-section experience-settings"><div className="admin-v5-title"><div><h2>Profile homepage experience</h2><p>Each profile gets its own title, description and cinematic background.</p></div></div><form className="admin-upload-form" onSubmit={saveExperience}><label>Choose profile<select required value={selectedExperienceProfileId} onChange={e=>setSelectedExperienceProfileId(e.target.value)}><option value="">Select a profile</option>{profiles.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Small top label<input value={siteForm.hero_kicker || ''} onChange={e=>setSiteForm({...siteForm,hero_kicker:e.target.value})} placeholder="OUR LITTLE UNIVERSE ORIGINAL"/></label><div className="experience-title-fields"><label>Main title<input value={siteForm.hero_title || ''} onChange={e=>setSiteForm({...siteForm,hero_title:e.target.value})} placeholder="Little"/></label><label>Italic title<input value={siteForm.hero_emphasis || ''} onChange={e=>setSiteForm({...siteForm,hero_emphasis:e.target.value})} placeholder="Adventures."/></label></div><label>Description<textarea rows="3" value={siteForm.hero_subtitle || ''} onChange={e=>setSiteForm({...siteForm,hero_subtitle:e.target.value})} placeholder="Write your own homepage description…"/></label><div className="experience-title-fields"><label>Collection label<input value={siteForm.hero_collection_label || ''} onChange={e=>setSiteForm({...siteForm,hero_collection_label:e.target.value})}/></label><label>Content label<input value={siteForm.hero_type_label || ''} onChange={e=>setSiteForm({...siteForm,hero_type_label:e.target.value})}/></label></div><label>Netflix-style hero background image<input type="file" accept="image/*" onChange={e=>uploadHeroBackground(e.target.files?.[0])}/></label>{heroPreview && <div className="hero-background-preview" style={{backgroundImage:`linear-gradient(0deg,#0008,transparent),url("${heroPreview}")`}}><span>Current homepage background</span></div>}<label>Netflix-style hero background video (MP4 / WebM)<input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={e=>uploadHeroBackgroundVideo(e.target.files?.[0])}/><small>Video is stored in original uploaded quality. For smoother mobile playback, use an optimized 1080p/4K MP4 (H.264) and keep a background image as fallback.</small></label>{heroVideoPreview && <div className="hero-background-preview hero-video-preview"><video src={heroVideoPreview} muted autoPlay loop playsInline controls/><span>Current homepage background video</span></div>}<button className="primary-btn" disabled={busy}>{busy?'Saving…':'Save homepage design'}</button><small>Use a wide landscape image (16:9 or wider). This homepage design applies only to the selected profile and its private background remains in Supabase Storage.</small></form></section>}
    {tab==='library' && <section className="admin-v5-section"><div className="admin-v5-title"><div><h2>Media library</h2><p>{memories.length} uploaded memories</p></div></div><div className="admin-memory-list">{memories.map(m=><article key={m.id}><div><strong>{m.title}</strong><small>{m.media_type || 'media'} · {m.category || 'Uncategorized'} · {m.is_highlighted ? 'New & Highlight' : 'Standard'} · {m.created_at ? new Date(m.created_at).toLocaleDateString() : ''}</small></div><button className="danger-btn" onClick={()=>deleteMemory(m)}><Trash2 size={16}/> Delete</button></article>)}</div>{!memories.length&&<p className="muted">No uploaded memories yet.</p>}</section>}
  </main>
}
