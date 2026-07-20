import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import ConsoleLayout from '../components/ConsoleLayout'
import Avatar from '../components/Avatar'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Field } from './Signup'
import { getFileUrl } from '../lib/files'

// ─── helpers ────────────────────────────────────────────────────────────────

function mkLesson() {
  return {
    _key: crypto.randomUUID(),
    id: null,
    title: '',
    content: '',
    video_url: '',
    attachment_url: '',
    _attachmentFile: null,
    required_action: 'none',
    action_prompt: '',
  }
}

function mkModule() {
  return { _key: crypto.randomUUID(), id: null, title: '', outcome: '', reflective_question: '', image_url: '', _imageFile: null, quiz: null, lessons: [] }
}

async function uploadFile(bucket, folder, file) {
  const ext = file.name.split('.').pop()
  const path = `${folder}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from(bucket).upload(path, file)
  if (error) throw error
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
}

// ─── main component ──────────────────────────────────────────────────────────

export default function CourseEditor() {
  const { id } = useParams()
  const isNew = id === 'new'
  const navigate = useNavigate()
  const { session, profile } = useAuth()
  const userId = session?.user?.id
  const isAdmin = profile?.role === 'admin'

  // course fields
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [coverUrl, setCoverUrl] = useState('')
  const [coverFile, setCoverFile] = useState(null)
  const [coverPreview, setCoverPreview] = useState(null)
  const [isPublished, setIsPublished] = useState(false)

  // module + lesson + quiz tree
  const [modules, setModules] = useState([])
  const [deletedModuleIds, setDeletedModuleIds] = useState([])
  const [deletedLessonIds, setDeletedLessonIds] = useState([])
  const [deletedQuizIds, setDeletedQuizIds] = useState([])

  // open lesson key for accordion
  const [openKey, setOpenKey] = useState(null)

  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // collaborator management (owner/admin only)
  const [courseInstructorId, setCourseInstructorId] = useState(null)
  const [collaborators, setCollaborators] = useState([])
  const [allInstructors, setAllInstructors] = useState([])
  const [addCollabId, setAddCollabId] = useState('')
  const [collabSearch, setCollabSearch] = useState('')
  const [addingCollab, setAddingCollab] = useState(false)
  const [collabError, setCollabError] = useState('')

  // ── load existing course ────────────────────────────────────────────────
  useEffect(() => {
    if (isNew) return
    async function fetch() {
      const { data, error: err } = await supabase
        .from('courses')
        .select(`
          id, title, description, cover_image, is_published, instructor_id,
          modules (
            id, title, order_index, outcome, reflective_question, image_url,
            quizzes ( id, title, passing_score, max_attempts ),
            lessons ( id, title, content, video_url, attachment_url, order_index, required_action, action_prompt )
          )
        `)
        .eq('id', id)
        .single()

      if (err || !data) {
        setError('Course not found.')
        setLoading(false)
        return
      }

      setTitle(data.title ?? '')
      setDescription(data.description ?? '')
      setCoverUrl(data.cover_image ?? '')
      setIsPublished(data.is_published ?? false)
      setCourseInstructorId(data.instructor_id ?? null)
      setModules(
        [...(data.modules ?? [])]
          .sort((a, b) => a.order_index - b.order_index)
          .map((m) => {
            const q = (m.quizzes ?? [])[0]
            return {
              _key: m.id,
              id: m.id,
              title: m.title ?? '',
              outcome: m.outcome ?? '',
              reflective_question: m.reflective_question ?? '',
              image_url: m.image_url ?? '',
              _imageFile: null,
              quiz: q
                ? {
                    id: q.id,
                    title: q.title ?? '',
                    passing_score: q.passing_score ?? 70,
                    max_attempts: q.max_attempts ?? 3,
                  }
                : null,
              lessons: [...(m.lessons ?? [])]
                .sort((a, b) => a.order_index - b.order_index)
                .map((l) => ({
                  _key: l.id,
                  id: l.id,
                  title: l.title ?? '',
                  content: l.content ?? '',
                  video_url: l.video_url ?? '',
                  attachment_url: l.attachment_url ?? '',
                  _attachmentFile: null,
                  required_action: l.required_action ?? 'none',
                  action_prompt: l.action_prompt ?? '',
                })),
            }
          }),
      )

      const [collabRes, instructorRes] = await Promise.all([
        supabase
          .from('course_instructors')
          .select('instructor_id, profiles!instructor_id(full_name, avatar_url)')
          .eq('course_id', id),
        supabase
          .from('profiles')
          .select('id, full_name')
          .eq('role', 'instructor')
          .order('full_name'),
      ])
      setCollaborators(collabRes.data ?? [])
      setAllInstructors(instructorRes.data ?? [])

      setLoading(false)
    }
    fetch()
  }, [id, isNew])

  // ── cover image preview ─────────────────────────────────────────────────
  useEffect(() => {
    if (!coverFile) { setCoverPreview(null); return }
    const url = URL.createObjectURL(coverFile)
    setCoverPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [coverFile])

  // ── save ────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!title.trim()) { setError('Title is required.'); return }
    setError('')
    setSaving(true)

    try {
      let finalCoverUrl = coverUrl
      if (coverFile) {
        finalCoverUrl = await uploadFile('course-files', 'covers', coverFile)
        setCoverUrl(finalCoverUrl)
        setCoverFile(null)
      }

      let courseId = isNew ? null : id
      if (courseId) {
        const { error: e } = await supabase
          .from('courses')
          .update({ title, description, cover_image: finalCoverUrl, is_published: isPublished })
          .eq('id', courseId)
        if (e) throw e
      } else {
        const { data, error: e } = await supabase
          .from('courses')
          .insert({
            title,
            description,
            cover_image: finalCoverUrl,
            is_published: isPublished,
            instructor_id: session.user.id,
          })
          .select('id')
          .single()
        if (e) throw e
        courseId = data.id
      }

      if (deletedLessonIds.length) {
        const { error: e } = await supabase.from('lessons').delete().in('id', deletedLessonIds)
        if (e) throw e
      }
      if (deletedQuizIds.length) {
        const { error: e } = await supabase.from('quizzes').delete().in('id', deletedQuizIds)
        if (e) throw e
      }
      if (deletedModuleIds.length) {
        const { error: e } = await supabase.from('modules').delete().in('id', deletedModuleIds)
        if (e) throw e
      }

      for (let mi = 0; mi < modules.length; mi++) {
        const mod = modules[mi]
        let moduleId = mod.id

        let finalImageUrl = mod.image_url || null
        if (mod._imageFile) {
          const ext = mod._imageFile.name.split('.').pop()
          const imgPath = `topic-images/${courseId}/${crypto.randomUUID()}.${ext}`
          const { error: imgErr } = await supabase.storage
            .from('course-files')
            .upload(imgPath, mod._imageFile)
          if (imgErr) throw imgErr
          finalImageUrl = imgPath
        }

        if (moduleId) {
          const { error: e } = await supabase
            .from('modules')
            .update({
              title: mod.title,
              order_index: mi,
              outcome: mod.outcome || null,
              reflective_question: mod.reflective_question || null,
              image_url: finalImageUrl,
            })
            .eq('id', moduleId)
          if (e) throw e
        } else {
          const { data, error: e } = await supabase
            .from('modules')
            .insert({
              title: mod.title,
              order_index: mi,
              course_id: courseId,
              outcome: mod.outcome || null,
              reflective_question: mod.reflective_question || null,
              image_url: finalImageUrl,
            })
            .select('id')
            .single()
          if (e) throw e
          moduleId = data.id
        }

        for (let li = 0; li < mod.lessons.length; li++) {
          const l = mod.lessons[li]

          let attachUrl = l.attachment_url
          if (l._attachmentFile) {
            attachUrl = await uploadFile('course-files', 'attachments', l._attachmentFile)
          }

          const row = {
            title: l.title,
            content: l.content,
            video_url: l.video_url,
            attachment_url: attachUrl,
            order_index: li,
            module_id: moduleId,
            required_action: l.required_action || 'none',
            action_prompt: l.action_prompt || null,
          }

          if (l.id) {
            const { error: e } = await supabase.from('lessons').update(row).eq('id', l.id)
            if (e) throw e
          } else {
            const { error: e } = await supabase.from('lessons').insert(row)
            if (e) throw e
          }
        }

        if (mod.quiz !== null) {
          const quizRow = {
            title: mod.quiz.title,
            passing_score: Number(mod.quiz.passing_score),
            max_attempts: Number(mod.quiz.max_attempts),
            module_id: moduleId,
          }
          if (mod.quiz.id) {
            const { error: e } = await supabase
              .from('quizzes')
              .update(quizRow)
              .eq('id', mod.quiz.id)
            if (e) throw e
          } else {
            const { error: e } = await supabase.from('quizzes').insert(quizRow)
            if (e) throw e
          }
        }
      }

      navigate('/instructor/courses')
    } catch (err) {
      setError(err.message ?? 'Something went wrong — try again.')
    } finally {
      setSaving(false)
    }
  }

  // ── module helpers ──────────────────────────────────────────────────────
  function addModule() {
    setModules((prev) => [...prev, mkModule()])
  }

  function updateModuleTitle(key, val) {
    setModules((prev) => prev.map((m) => (m._key === key ? { ...m, title: val } : m)))
  }

  function updateModuleField(key, field, val) {
    setModules((prev) => prev.map((m) => (m._key === key ? { ...m, [field]: val } : m)))
  }

  function deleteModule(key) {
    const mod = modules.find((m) => m._key === key)
    if (mod.id) setDeletedModuleIds((p) => [...p, mod.id])
    if (mod.quiz?.id) setDeletedQuizIds((p) => [...p, mod.quiz.id])
    const lessonIds = mod.lessons.filter((l) => l.id).map((l) => l.id)
    if (lessonIds.length) setDeletedLessonIds((p) => [...p, ...lessonIds])
    setModules((prev) => prev.filter((m) => m._key !== key))
  }

  function moveModule(key, dir) {
    setModules((prev) => {
      const i = prev.findIndex((m) => m._key === key)
      const j = i + dir
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  // ── quiz helpers ────────────────────────────────────────────────────────
  function addQuiz(modKey) {
    setModules((prev) =>
      prev.map((m) =>
        m._key === modKey
          ? { ...m, quiz: { id: null, title: '', passing_score: 70, max_attempts: 3 } }
          : m,
      ),
    )
  }

  function updateQuiz(modKey, patch) {
    setModules((prev) =>
      prev.map((m) =>
        m._key === modKey && m.quiz ? { ...m, quiz: { ...m.quiz, ...patch } } : m,
      ),
    )
  }

  function removeQuiz(modKey) {
    const mod = modules.find((m) => m._key === modKey)
    if (mod?.quiz?.id) setDeletedQuizIds((p) => [...p, mod.quiz.id])
    setModules((prev) => prev.map((m) => (m._key === modKey ? { ...m, quiz: null } : m)))
  }

  // ── lesson helpers ──────────────────────────────────────────────────────
  function addLesson(modKey) {
    const lesson = mkLesson()
    setModules((prev) =>
      prev.map((m) => (m._key === modKey ? { ...m, lessons: [...m.lessons, lesson] } : m)),
    )
    setOpenKey(lesson._key)
  }

  function updateLesson(modKey, lessonKey, patch) {
    setModules((prev) =>
      prev.map((m) =>
        m._key !== modKey
          ? m
          : {
              ...m,
              lessons: m.lessons.map((l) =>
                l._key === lessonKey ? { ...l, ...patch } : l,
              ),
            },
      ),
    )
  }

  function deleteLesson(modKey, lessonKey) {
    const mod = modules.find((m) => m._key === modKey)
    const lesson = mod?.lessons.find((l) => l._key === lessonKey)
    if (lesson?.id) setDeletedLessonIds((p) => [...p, lesson.id])
    if (openKey === lessonKey) setOpenKey(null)
    setModules((prev) =>
      prev.map((m) =>
        m._key !== modKey
          ? m
          : { ...m, lessons: m.lessons.filter((l) => l._key !== lessonKey) },
      ),
    )
  }

  function moveLesson(modKey, lessonKey, dir) {
    setModules((prev) =>
      prev.map((m) => {
        if (m._key !== modKey) return m
        const i = m.lessons.findIndex((l) => l._key === lessonKey)
        const j = i + dir
        if (j < 0 || j >= m.lessons.length) return m
        const next = [...m.lessons]
        ;[next[i], next[j]] = [next[j], next[i]]
        return { ...m, lessons: next }
      }),
    )
  }

  // ── collaborator handlers ────────────────────────────────────────────────
  async function handleAddCollab() {
    if (!addCollabId) return
    setAddingCollab(true)
    setCollabError('')
    const { error: err } = await supabase
      .from('course_instructors')
      .insert({ course_id: id, instructor_id: addCollabId, added_by: userId })
    setAddingCollab(false)
    if (err) {
      setCollabError(err.message ?? 'Failed to add collaborator.')
    } else {
      const added = allInstructors.find((p) => p.id === addCollabId)
      setCollaborators((prev) => [
        ...prev,
        { instructor_id: addCollabId, profiles: { full_name: added?.full_name ?? '', avatar_url: null } },
      ])
      setAddCollabId('')
      setCollabSearch('')
    }
  }

  async function handleRemoveCollab(instructorId) {
    setCollabError('')
    const { error: err } = await supabase
      .from('course_instructors')
      .delete()
      .eq('course_id', id)
      .eq('instructor_id', instructorId)
    if (err) {
      setCollabError(err.message ?? 'Failed to remove collaborator.')
    } else {
      setCollaborators((prev) => prev.filter((c) => c.instructor_id !== instructorId))
    }
  }

  // ── computed ─────────────────────────────────────────────────────────────
  const isOwner = Boolean(courseInstructorId && courseInstructorId === userId)
  const canManageCollabs = !isNew && (isOwner || isAdmin)
  const collabSet = new Set(collaborators.map((c) => c.instructor_id))
  const eligibleInstructors = allInstructors.filter(
    (p) => p.id !== courseInstructorId && !collabSet.has(p.id),
  )
  const filteredInstructors = collabSearch.trim()
    ? eligibleInstructors.filter((p) =>
        (p.full_name ?? '').toLowerCase().includes(collabSearch.toLowerCase()),
      )
    : eligibleInstructors

  // ── render ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <ConsoleLayout title={isNew ? 'New Course' : 'Edit Course'}>
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-ink/5" />
          ))}
        </div>
      </ConsoleLayout>
    )
  }

  return (
    <ConsoleLayout title={isNew ? 'New Course' : 'Edit Course'}>

      {/* ── Top action bar ──────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        {error ? (
          <p className="text-sm text-clay">{error}</p>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-3">
          <Link to="/instructor/courses" className="efac-btn-ghost">
            Cancel
          </Link>
          <button onClick={handleSave} disabled={saving} className="efac-btn">
            {saving ? 'Saving…' : isNew ? 'Create course' : 'Save changes'}
          </button>
        </div>
      </div>

      {/* ── Course details ──────────────────────────────────────────────── */}
      <section className="efac-card mb-6 overflow-hidden">
        <div className="border-b border-ink/8 px-6 py-4">
          <h2 className="font-display text-lg font-semibold text-navy">Course details</h2>
        </div>

        <div className="space-y-5 px-6 py-5">
          <Field label="Title" id="title">
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="efac-input"
            />
          </Field>

          <Field label="Description" id="description">
            <textarea
              id="description"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="efac-input resize-y"
            />
          </Field>

          <Field label="Cover image" id="cover">
            {(coverPreview || coverUrl) && (
              <img
                src={coverPreview ?? coverUrl}
                alt="Cover preview"
                className="mb-2 h-32 w-full rounded-lg object-cover"
              />
            )}
            <input
              id="cover"
              type="file"
              accept="image/*"
              onChange={(e) => setCoverFile(e.target.files[0] ?? null)}
              className="block text-sm text-ink/70 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-teal-tint file:px-3 file:py-1 file:text-sm file:font-medium file:text-teal"
            />
          </Field>

          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={isPublished}
              onChange={(e) => setIsPublished(e.target.checked)}
              className="h-4 w-4 rounded border-ink/20 accent-teal"
            />
            <span className="text-sm font-medium text-ink">Published</span>
          </label>
        </div>
      </section>

      {/* ── Collaborators ───────────────────────────────── owner/admin only */}
      {canManageCollabs && (
        <section className="efac-card mb-6 overflow-hidden">
          <div className="border-b border-ink/8 px-6 py-4">
            <h2 className="font-display text-lg font-semibold text-navy">Collaborators</h2>
            <p className="mt-0.5 text-sm text-ink/50">
              Collaborators can edit course content. Only the course owner and admins see this panel.
            </p>
          </div>

          {collaborators.length === 0 ? (
            <p className="px-6 py-4 text-sm text-ink/40">No collaborators added yet.</p>
          ) : (
            <ul className="divide-y divide-ink/5">
              {collaborators.map((c) => (
                <li key={c.instructor_id} className="flex items-center justify-between px-6 py-3.5">
                  <div className="flex items-center gap-2.5">
                    <Avatar
                      url={c.profiles?.avatar_url}
                      name={c.profiles?.full_name}
                      className="h-7 w-7 shrink-0 text-[10px] font-extrabold"
                    />
                    <span className="text-sm font-medium text-ink">
                      {c.profiles?.full_name ?? '—'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveCollab(c.instructor_id)}
                    className="text-xs font-medium text-clay transition-colors hover:underline"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-ink/8 bg-sand/30 px-6 py-5">
            <p className="mb-3 efac-eyebrow text-ink/40">Add collaborator</p>
            {eligibleInstructors.length === 0 ? (
              <p className="text-sm text-ink/40">No other instructors available to add.</p>
            ) : (
              <div className="space-y-2">
                <input
                  type="search"
                  placeholder="Filter by name…"
                  value={collabSearch}
                  onChange={(e) => { setCollabSearch(e.target.value); setAddCollabId('') }}
                  className="efac-input"
                />
                <div className="flex items-center gap-3">
                  <select
                    value={addCollabId}
                    onChange={(e) => setAddCollabId(e.target.value)}
                    className="efac-input flex-1"
                  >
                    <option value="">Select an instructor…</option>
                    {filteredInstructors.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleAddCollab}
                    disabled={!addCollabId || addingCollab}
                    className="efac-btn shrink-0 disabled:opacity-60"
                  >
                    {addingCollab ? 'Adding…' : 'Add'}
                  </button>
                </div>
              </div>
            )}
            {collabError && (
              <p className="mt-2 text-sm text-clay">{collabError}</p>
            )}
          </div>
        </section>
      )}

      {/* ── Topics (modules) ────────────────────────────────────────────── */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-navy">Topics</h2>
          <span className="text-sm text-ink/40">
            {modules.length} topic{modules.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="space-y-4">
          {modules.map((mod, mi) => (
            <div
              key={mod._key}
              className="overflow-hidden rounded-xl border border-ink/10 bg-white"
            >
              {/* topic header row */}
              <div className="flex items-center gap-2 border-b border-ink/8 bg-sand/30 px-4 py-3">
                <span className="shrink-0 rounded-full bg-navy/8 px-2 py-0.5 text-[11px] font-semibold text-navy/60">
                  {mi + 1}
                </span>
                <input
                  type="text"
                  placeholder="Topic title"
                  value={mod.title}
                  onChange={(e) => updateModuleTitle(mod._key, e.target.value)}
                  className="flex-1 rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-sm text-ink outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
                />
                <div className="flex shrink-0 items-center gap-0.5">
                  <IconBtn
                    label="Move topic up"
                    onClick={() => moveModule(mod._key, -1)}
                    disabled={mi === 0}
                  >
                    ↑
                  </IconBtn>
                  <IconBtn
                    label="Move topic down"
                    onClick={() => moveModule(mod._key, 1)}
                    disabled={mi === modules.length - 1}
                  >
                    ↓
                  </IconBtn>
                  <IconBtn
                    label="Delete topic"
                    onClick={() => deleteModule(mod._key)}
                    danger
                  >
                    ×
                  </IconBtn>
                </div>
              </div>

              {/* outcome + reflective question + topic image */}
              <div className="grid gap-4 border-b border-ink/8 bg-paper px-5 py-5 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor={`out-${mod._key}`}
                    className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink/40"
                  >
                    Learning outcome
                  </label>
                  <textarea
                    id={`out-${mod._key}`}
                    rows={3}
                    value={mod.outcome}
                    onChange={(e) => updateModuleField(mod._key, 'outcome', e.target.value)}
                    placeholder="What learners will be able to do after this topic…"
                    className="efac-input resize-y"
                  />
                </div>
                <div>
                  <label
                    htmlFor={`rq-${mod._key}`}
                    className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink/40"
                  >
                    Reflective question
                  </label>
                  <textarea
                    id={`rq-${mod._key}`}
                    rows={3}
                    value={mod.reflective_question}
                    onChange={(e) =>
                      updateModuleField(mod._key, 'reflective_question', e.target.value)
                    }
                    placeholder="A question for learners to consider before starting…"
                    className="efac-input resize-y"
                  />
                </div>
                <div className="sm:col-span-2">
                  <ModuleImageField
                    imageUrl={mod.image_url}
                    imageFile={mod._imageFile}
                    onFileChange={(f) => updateModuleField(mod._key, '_imageFile', f)}
                  />
                </div>
              </div>

              {/* materials & recordings manager */}
              {mod.id ? (
                <ResourceManager moduleId={mod.id} />
              ) : (
                <p className="border-b border-ink/8 px-5 py-3 text-xs text-ink/40">
                  Save the course to manage materials and recordings.
                </p>
              )}

              {/* lessons list */}
              <ul className="divide-y divide-ink/8">
                {mod.lessons.map((lesson, li) => (
                  <li key={lesson._key}>
                    {/* lesson header row */}
                    <div
                      className="flex cursor-pointer items-center gap-2 px-4 py-3 transition-colors hover:bg-sand/40"
                      onClick={() =>
                        setOpenKey((k) => (k === lesson._key ? null : lesson._key))
                      }
                    >
                      <span className="shrink-0 text-xs font-medium text-ink/35">
                        Lesson {li + 1}
                      </span>
                      <span className="flex-1 truncate text-sm font-medium text-ink">
                        {lesson.title || (
                          <span className="italic text-ink/30">Untitled lesson</span>
                        )}
                      </span>
                      {lesson.required_action !== 'none' && (
                        <span className="shrink-0 rounded-full bg-orange-tint px-2 py-0.5 text-[10px] font-semibold text-orange">
                          {lesson.required_action === 'link' ? 'Link' : lesson.required_action === 'file' ? 'File' : 'Response'}
                        </span>
                      )}
                      <div
                        className="flex shrink-0 items-center gap-0.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <IconBtn
                          label="Move lesson up"
                          onClick={() => moveLesson(mod._key, lesson._key, -1)}
                          disabled={li === 0}
                        >
                          ↑
                        </IconBtn>
                        <IconBtn
                          label="Move lesson down"
                          onClick={() => moveLesson(mod._key, lesson._key, 1)}
                          disabled={li === mod.lessons.length - 1}
                        >
                          ↓
                        </IconBtn>
                        <IconBtn
                          label="Delete lesson"
                          onClick={() => deleteLesson(mod._key, lesson._key)}
                          danger
                        >
                          ×
                        </IconBtn>
                      </div>
                      <svg
                        viewBox="0 0 16 16"
                        fill="currentColor"
                        className={`h-3 w-3 shrink-0 text-ink/30 transition-transform ${
                          openKey === lesson._key ? 'rotate-180' : ''
                        }`}
                        aria-hidden="true"
                      >
                        <path d="M2 5l6 6 6-6H2z" />
                      </svg>
                    </div>

                    {/* lesson fields */}
                    {openKey === lesson._key && (
                      <div className="border-t border-ink/8 bg-paper px-5 py-5">
                        <div className="space-y-4">
                          <Field label="Title" id={`lt-${lesson._key}`}>
                            <input
                              id={`lt-${lesson._key}`}
                              type="text"
                              value={lesson.title}
                              onChange={(e) =>
                                updateLesson(mod._key, lesson._key, { title: e.target.value })
                              }
                              className="efac-input"
                            />
                          </Field>

                          <Field label="Content" id={`lc-${lesson._key}`}>
                            <textarea
                              id={`lc-${lesson._key}`}
                              rows={5}
                              value={lesson.content}
                              onChange={(e) =>
                                updateLesson(mod._key, lesson._key, { content: e.target.value })
                              }
                              className="efac-input resize-y"
                            />
                          </Field>

                          <Field label="Video URL" id={`lv-${lesson._key}`}>
                            <input
                              id={`lv-${lesson._key}`}
                              type="url"
                              placeholder="https://…"
                              value={lesson.video_url}
                              onChange={(e) =>
                                updateLesson(mod._key, lesson._key, { video_url: e.target.value })
                              }
                              className="efac-input"
                            />
                          </Field>

                          <Field label="Required action" id={`lra-${lesson._key}`}>
                            <select
                              id={`lra-${lesson._key}`}
                              value={lesson.required_action}
                              onChange={(e) =>
                                updateLesson(mod._key, lesson._key, {
                                  required_action: e.target.value,
                                  action_prompt: '',
                                })
                              }
                              className="efac-input"
                            >
                              <option value="none">None — learners mark done freely</option>
                              <option value="link">Link — learners must submit a URL</option>
                              <option value="file">File — learners must upload a file</option>
                              <option value="text">Written response — learners type a response</option>
                            </select>
                          </Field>

                          {lesson.required_action !== 'none' && (
                            <Field label="Action prompt" id={`lap-${lesson._key}`}>
                              <input
                                id={`lap-${lesson._key}`}
                                type="text"
                                placeholder={
                                  lesson.required_action === 'link'
                                    ? 'e.g. Share a link to your completed project…'
                                    : lesson.required_action === 'text'
                                    ? 'e.g. Describe the key insight you took from this lesson…'
                                    : 'e.g. Upload a photo of your finished work…'
                                }
                                value={lesson.action_prompt}
                                onChange={(e) =>
                                  updateLesson(mod._key, lesson._key, { action_prompt: e.target.value })
                                }
                                className="efac-input"
                              />
                            </Field>
                          )}

                          <Field label="Attachment" id={`la-${lesson._key}`}>
                            {lesson.attachment_url && !lesson._attachmentFile && (
                              <a
                                href={lesson.attachment_url}
                                target="_blank"
                                rel="noreferrer"
                                className="mb-1 block truncate text-xs text-teal hover:underline"
                              >
                                Current attachment
                              </a>
                            )}
                            <input
                              id={`la-${lesson._key}`}
                              type="file"
                              onChange={(e) =>
                                updateLesson(mod._key, lesson._key, {
                                  _attachmentFile: e.target.files[0] ?? null,
                                })
                              }
                              className="block text-sm text-ink/70 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-teal-tint file:px-3 file:py-1 file:text-sm file:font-medium file:text-teal"
                            />
                          </Field>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>

              {/* add lesson */}
              <div className="border-b border-ink/8 px-4 py-3">
                <button
                  type="button"
                  onClick={() => addLesson(mod._key)}
                  className="text-sm font-medium text-teal hover:underline"
                >
                  + Add lesson
                </button>
              </div>

              {/* quiz section */}
              {mod.quiz === null ? (
                <div className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => addQuiz(mod._key)}
                    className="text-sm font-medium text-ink/40 hover:text-teal hover:underline"
                  >
                    + Add quiz
                  </button>
                </div>
              ) : (
                <div className="space-y-4 border-t border-ink/8 bg-navy/[0.02] px-5 py-4">
                  <div className="flex items-center justify-between">
                    <p className="efac-eyebrow text-ink/40">Quiz</p>
                    <div className="flex items-center gap-4">
                      {mod.quiz.id && (
                        <Link
                          to={`/instructor/quizzes/${mod.quiz.id}`}
                          className="text-xs font-medium text-teal hover:underline"
                        >
                          Build questions →
                        </Link>
                      )}
                      <button
                        type="button"
                        onClick={() => removeQuiz(mod._key)}
                        className="text-xs text-clay hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  <Field label="Quiz title" id={`qt-${mod._key}`}>
                    <input
                      id={`qt-${mod._key}`}
                      type="text"
                      value={mod.quiz.title}
                      onChange={(e) => updateQuiz(mod._key, { title: e.target.value })}
                      className="efac-input"
                    />
                  </Field>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Passing score (%)" id={`qp-${mod._key}`}>
                      <input
                        id={`qp-${mod._key}`}
                        type="number"
                        min="0"
                        max="100"
                        value={mod.quiz.passing_score}
                        onChange={(e) =>
                          updateQuiz(mod._key, { passing_score: Number(e.target.value) })
                        }
                        className="efac-input"
                      />
                    </Field>
                    <Field label="Max attempts" id={`qa-${mod._key}`}>
                      <input
                        id={`qa-${mod._key}`}
                        type="number"
                        min="1"
                        value={mod.quiz.max_attempts}
                        onChange={(e) =>
                          updateQuiz(mod._key, { max_attempts: Number(e.target.value) })
                        }
                        className="efac-input"
                      />
                    </Field>
                  </div>

                  {!mod.quiz.id && (
                    <p className="text-xs text-ink/40">
                      Save the course to unlock question editing.
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addModule}
          className="mt-4 w-full rounded-xl border-2 border-dashed border-ink/15 py-3.5 text-sm font-medium text-ink/40 transition-colors hover:border-teal/40 hover:text-teal"
        >
          + Add topic
        </button>
      </section>

      {/* Bottom save */}
      <div className="mt-10 flex items-center justify-end gap-3">
        {error && <p className="text-sm text-clay">{error}</p>}
        <Link to="/instructor/courses" className="efac-btn-ghost">
          Cancel
        </Link>
        <button onClick={handleSave} disabled={saving} className="efac-btn">
          {saving ? 'Saving…' : isNew ? 'Create course' : 'Save changes'}
        </button>
      </div>
    </ConsoleLayout>
  )
}

// ─── resource manager ────────────────────────────────────────────────────────

const KIND_LABELS = {
  note: 'Note',
  pdf: 'PDF',
  doc: 'Document',
  youtube: 'YouTube',
  link: 'Link',
  recording: 'Recording',
}

function ResourceManager({ moduleId }) {
  const [resources, setResources] = useState(null)
  const [form, setForm] = useState({ kind: 'pdf', title: '', url: '', body: '' })
  const [mode, setMode] = useState('url')
  const [fileObj, setFileObj] = useState(null)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')

  const isNote = form.kind === 'note'

  useEffect(() => {
    supabase
      .from('module_resources')
      .select('id, kind, title, url, body, order_index')
      .eq('module_id', moduleId)
      .order('order_index')
      .then(({ data }) => setResources(data ?? []))
  }, [moduleId])

  function handleKindChange(newKind) {
    setForm((p) => ({ ...p, kind: newKind, url: '', body: '' }))
    setFileObj(null)
    setAddError('')
  }

  function switchMode(next) {
    setMode(next)
    setFileObj(null)
    setForm((p) => ({ ...p, url: '' }))
    setAddError('')
  }

  async function handleAdd() {
    setAddError('')

    if (isNote) {
      // notes: no url/file required
    } else if (mode === 'url' && !form.url.trim()) {
      setAddError('URL is required.')
      return
    } else if (mode === 'file' && !fileObj) {
      setAddError('Please choose a file.')
      return
    }

    setAdding(true)
    try {
      let finalUrl = isNote ? null : form.url.trim()
      if (!isNote && mode === 'file') {
        const ext = fileObj.name.split('.').pop()
        const uploadPath = `resources/${moduleId}/${crypto.randomUUID()}.${ext}`
        const { error: upErr } = await supabase.storage
          .from('course-files')
          .upload(uploadPath, fileObj)
        if (upErr) throw upErr
        finalUrl = uploadPath
      }

      const { data, error } = await supabase
        .from('module_resources')
        .insert({
          module_id: moduleId,
          kind: form.kind,
          title: form.title.trim() || null,
          url: finalUrl,
          body: isNote ? (form.body.trim() || null) : null,
          order_index: (resources ?? []).length,
        })
        .select('id, kind, title, url, body, order_index')
        .single()
      if (error) throw error
      setResources((prev) => [...(prev ?? []), data])
      setForm((p) => ({ ...p, title: '', url: '', body: '' }))
      setFileObj(null)
    } catch (e) {
      setAddError(e.message ?? 'Could not add — try again.')
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(resourceId) {
    const { error } = await supabase
      .from('module_resources')
      .delete()
      .eq('id', resourceId)
    if (!error) {
      setResources((prev) => (prev ?? []).filter((r) => r.id !== resourceId))
    }
  }

  if (resources === null) {
    return (
      <p className="border-b border-ink/8 px-5 py-3 text-xs text-ink/40">
        Loading resources…
      </p>
    )
  }

  return (
    <div className="border-b border-ink/8 px-5 py-4">
      <p className="mb-3 efac-eyebrow text-ink/40">Materials &amp; recordings</p>

      {/* Existing resources */}
      {resources.length > 0 && (
        <ul className="mb-4 divide-y divide-ink/5 overflow-hidden rounded-lg border border-ink/10">
          {resources.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-3 py-2.5">
              <span className="shrink-0 rounded-full bg-teal-tint px-2 py-0.5 text-[10px] font-semibold text-teal">
                {KIND_LABELS[r.kind] ?? r.kind}
              </span>
              {r.kind === 'note' ? (
                <span className="min-w-0 flex-1 truncate text-sm text-ink/70">
                  {r.title || r.body || 'Untitled note'}
                </span>
              ) : (
                <a
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 truncate text-sm text-teal hover:underline"
                >
                  {r.title || r.url}
                </a>
              )}
              <button
                type="button"
                onClick={() => handleDelete(r.id)}
                className="shrink-0 text-xs text-clay hover:underline"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Add-resource form */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <select
            value={form.kind}
            onChange={(e) => handleKindChange(e.target.value)}
            className="efac-input w-36 shrink-0"
          >
            <option value="note">Note</option>
            <option value="pdf">PDF</option>
            <option value="doc">Word / Document</option>
            <option value="youtube">YouTube</option>
            <option value="link">Link</option>
            <option value="recording">Recording</option>
          </select>
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
            placeholder="Title (optional)"
            className="efac-input"
          />
        </div>

        {isNote ? (
          <textarea
            rows={4}
            value={form.body}
            onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))}
            placeholder="Write your note here…"
            className="efac-input resize-y"
          />
        ) : (
          <>
            <div className="flex w-fit overflow-hidden rounded-lg border border-ink/15 text-xs font-medium">
              <button
                type="button"
                onClick={() => switchMode('url')}
                className={`px-3 py-1.5 transition-colors ${
                  mode === 'url'
                    ? 'bg-teal text-white'
                    : 'bg-white text-ink/60 hover:bg-sand hover:text-ink'
                }`}
              >
                URL
              </button>
              <button
                type="button"
                onClick={() => switchMode('file')}
                className={`border-l border-ink/15 px-3 py-1.5 transition-colors ${
                  mode === 'file'
                    ? 'bg-teal text-white'
                    : 'bg-white text-ink/60 hover:bg-sand hover:text-ink'
                }`}
              >
                Upload file
              </button>
            </div>

            {mode === 'url' ? (
              <input
                type="url"
                value={form.url}
                onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))}
                placeholder="https://…"
                className="efac-input"
              />
            ) : (
              <input
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,image/*"
                onChange={(e) => setFileObj(e.target.files?.[0] ?? null)}
                className="block text-sm text-ink/70 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-teal-tint file:px-3 file:py-1 file:text-sm file:font-medium file:text-teal"
              />
            )}
          </>
        )}

        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={handleAdd}
            disabled={adding}
            className="efac-btn-sm disabled:opacity-60"
          >
            {adding ? (mode === 'file' && !isNote ? 'Uploading…' : 'Adding…') : 'Add'}
          </button>
          {addError && <p className="text-xs text-clay">{addError}</p>}
        </div>
      </div>
    </div>
  )
}

// ─── module image upload field ────────────────────────────────────────────────

function ModuleImageField({ imageUrl, imageFile, onFileChange }) {
  const [resolvedUrl, setResolvedUrl] = useState(null)
  const [localPreview, setLocalPreview] = useState(null)

  useEffect(() => {
    if (!imageUrl) { setResolvedUrl(null); return }
    getFileUrl(imageUrl).then((url) => setResolvedUrl(url ?? null))
  }, [imageUrl])

  useEffect(() => {
    if (!imageFile) { setLocalPreview(null); return }
    const url = URL.createObjectURL(imageFile)
    setLocalPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [imageFile])

  const displayUrl = localPreview || resolvedUrl

  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink/40">
        Topic image
      </label>
      {displayUrl && (
        <img
          src={displayUrl}
          alt=""
          className="mb-2 h-[88px] w-full rounded-lg object-cover"
        />
      )}
      <input
        type="file"
        accept="image/*"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFileChange(f)
        }}
        className="block text-sm text-ink/70 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-teal-tint file:px-3 file:py-1 file:text-sm file:font-medium file:text-teal"
      />
    </div>
  )
}

// ─── shared icon button ───────────────────────────────────────────────────────

function IconBtn({ label, onClick, disabled, danger, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`grid h-7 w-7 place-items-center rounded text-sm transition-colors disabled:opacity-30 ${
        danger
          ? 'text-clay hover:bg-clay/10'
          : 'text-ink/40 hover:bg-teal-tint hover:text-teal'
      }`}
    >
      {children}
    </button>
  )
}
