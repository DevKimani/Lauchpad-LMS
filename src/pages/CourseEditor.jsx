import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { inputClass, btnClass, Field } from './Signup'
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
  const { session } = useAuth()

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

  // ── load existing course ────────────────────────────────────────────────
  useEffect(() => {
    if (isNew) return
    async function fetch() {
      const { data, error: err } = await supabase
        .from('courses')
        .select(`
          id, title, description, cover_image, is_published,
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
      // 1. Cover image upload
      let finalCoverUrl = coverUrl
      if (coverFile) {
        finalCoverUrl = await uploadFile('course-files', 'covers', coverFile)
        setCoverUrl(finalCoverUrl)
        setCoverFile(null)
      }

      // 2. Upsert course
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

      // 3. Delete removed items in FK-safe order: lessons → quizzes → modules
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

      // 4. Upsert modules, lessons, and quizzes in order
      for (let mi = 0; mi < modules.length; mi++) {
        const mod = modules[mi]
        let moduleId = mod.id

        // Upload topic image if a new file was selected
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

        // Quiz for this module
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

  // ── render ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <Layout>
        <p className="text-ink/60">Loading…</p>
      </Layout>
    )
  }

  return (
    <Layout>
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <h1 className="font-display text-3xl font-semibold text-teal-dark">
          {isNew ? 'New Course' : 'Edit Course'}
        </h1>
        <button onClick={handleSave} disabled={saving} className={`${btnClass} w-auto px-6`}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {error && (
        <p className="mb-6 rounded-lg bg-clay/10 px-4 py-3 text-sm text-clay">{error}</p>
      )}

      {/* ── Course details ──────────────────────────────────────────────── */}
      <section className="mb-8 space-y-5 rounded-xl border border-teal/10 bg-white p-6">
        <h2 className="font-display text-xl font-semibold text-teal-dark">Course details</h2>

        <Field label="Title" id="title">
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Description" id="description">
          <textarea
            id="description"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={`${inputClass} resize-y`}
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
            className="block text-sm text-ink/70 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-teal-light file:px-3 file:py-1 file:text-sm file:font-medium file:text-teal-dark"
          />
        </Field>

        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={isPublished}
            onChange={(e) => setIsPublished(e.target.checked)}
            className="h-4 w-4 rounded border-teal/20 accent-teal"
          />
          <span className="text-sm font-medium text-ink/80">Published</span>
        </label>
      </section>

      {/* ── Modules ─────────────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-4 font-display text-xl font-semibold text-teal-dark">Modules</h2>

        <div className="space-y-4">
          {modules.map((mod, mi) => (
            <div
              key={mod._key}
              className="overflow-hidden rounded-xl border border-teal/10 bg-white"
            >
              {/* module header row */}
              <div className="flex items-center gap-2 border-b border-teal/10 px-4 py-3">
                <span className="shrink-0 text-xs font-medium text-ink/40">
                  Module {mi + 1}
                </span>
                <input
                  type="text"
                  placeholder="Module title"
                  value={mod.title}
                  onChange={(e) => updateModuleTitle(mod._key, e.target.value)}
                  className="flex-1 rounded-md border border-teal/20 bg-white px-3 py-1.5 text-sm text-ink outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
                />
                <div className="flex shrink-0 items-center gap-1">
                  <IconBtn
                    label="Move module up"
                    onClick={() => moveModule(mod._key, -1)}
                    disabled={mi === 0}
                  >
                    ↑
                  </IconBtn>
                  <IconBtn
                    label="Move module down"
                    onClick={() => moveModule(mod._key, 1)}
                    disabled={mi === modules.length - 1}
                  >
                    ↓
                  </IconBtn>
                  <IconBtn
                    label="Delete module"
                    onClick={() => deleteModule(mod._key)}
                    danger
                  >
                    ×
                  </IconBtn>
                </div>
              </div>

              {/* outcome + reflective question */}
              <div className="space-y-4 border-b border-teal/10 bg-sand/30 px-5 py-4">
                <Field label="Learning outcome" id={`out-${mod._key}`}>
                  <textarea
                    id={`out-${mod._key}`}
                    rows={2}
                    value={mod.outcome}
                    onChange={(e) => updateModuleField(mod._key, 'outcome', e.target.value)}
                    placeholder="What learners will be able to do after this module…"
                    className={`${inputClass} resize-y`}
                  />
                </Field>
                <Field label="Reflective question" id={`rq-${mod._key}`}>
                  <textarea
                    id={`rq-${mod._key}`}
                    rows={2}
                    value={mod.reflective_question}
                    onChange={(e) =>
                      updateModuleField(mod._key, 'reflective_question', e.target.value)
                    }
                    placeholder="A question for learners to consider before starting…"
                    className={`${inputClass} resize-y`}
                  />
                </Field>
                <ModuleImageField
                  imageUrl={mod.image_url}
                  imageFile={mod._imageFile}
                  onFileChange={(f) => updateModuleField(mod._key, '_imageFile', f)}
                />
              </div>

              {/* materials & recordings manager */}
              {mod.id ? (
                <ResourceManager moduleId={mod.id} />
              ) : (
                <p className="border-b border-teal/10 px-5 py-3 text-xs text-ink/40">
                  Save the course to manage materials and recordings.
                </p>
              )}

              {/* lessons list */}
              <ul className="divide-y divide-teal/10">
                {mod.lessons.map((lesson, li) => (
                  <li key={lesson._key}>
                    {/* lesson header row */}
                    <div
                      className="flex cursor-pointer items-center gap-2 px-4 py-3 transition-colors hover:bg-sand"
                      onClick={() =>
                        setOpenKey((k) => (k === lesson._key ? null : lesson._key))
                      }
                    >
                      <span className="shrink-0 text-xs text-ink/40">Lesson {li + 1}</span>
                      <span className="flex-1 truncate text-sm font-medium text-ink">
                        {lesson.title || (
                          <span className="italic text-ink/30">Untitled lesson</span>
                        )}
                      </span>
                      <div
                        className="flex shrink-0 items-center gap-1"
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
                      <div className="space-y-4 border-t border-teal/10 bg-sand px-5 py-5">
                        <Field label="Title" id={`lt-${lesson._key}`}>
                          <input
                            id={`lt-${lesson._key}`}
                            type="text"
                            value={lesson.title}
                            onChange={(e) =>
                              updateLesson(mod._key, lesson._key, { title: e.target.value })
                            }
                            className={inputClass}
                          />
                        </Field>

                        <Field label="Content" id={`lc-${lesson._key}`}>
                          <textarea
                            id={`lc-${lesson._key}`}
                            rows={5}
                            value={lesson.content}
                            onChange={(e) =>
                              updateLesson(mod._key, lesson._key, {
                                content: e.target.value,
                              })
                            }
                            className={`${inputClass} resize-y`}
                          />
                        </Field>

                        <Field label="Video URL" id={`lv-${lesson._key}`}>
                          <input
                            id={`lv-${lesson._key}`}
                            type="url"
                            placeholder="https://…"
                            value={lesson.video_url}
                            onChange={(e) =>
                              updateLesson(mod._key, lesson._key, {
                                video_url: e.target.value,
                              })
                            }
                            className={inputClass}
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
                            className={inputClass}
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
                                updateLesson(mod._key, lesson._key, {
                                  action_prompt: e.target.value,
                                })
                              }
                              className={inputClass}
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
                            className="block text-sm text-ink/70 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-teal-light file:px-3 file:py-1 file:text-sm file:font-medium file:text-teal-dark"
                          />
                        </Field>
                      </div>
                    )}
                  </li>
                ))}
              </ul>

              {/* add lesson */}
              <div className="border-b border-teal/10 px-4 py-3">
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
                    className="text-sm font-medium text-teal/70 hover:text-teal hover:underline"
                  >
                    + Add quiz
                  </button>
                </div>
              ) : (
                <div className="space-y-4 bg-sand/60 px-5 py-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-ink/40">
                      Quiz
                    </span>
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
                      className={inputClass}
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
                        className={inputClass}
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
                        className={inputClass}
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
          className="mt-4 w-full rounded-xl border-2 border-dashed border-teal/20 py-3 text-sm font-medium text-teal/60 transition-colors hover:border-teal hover:text-teal"
        >
          + Add module
        </button>
      </section>

      {/* Bottom save */}
      <div className="mt-10 flex items-center justify-end gap-4">
        {error && <p className="text-sm text-clay">{error}</p>}
        <button onClick={handleSave} disabled={saving} className={`${btnClass} w-auto px-6`}>
          {saving ? 'Saving…' : 'Save course'}
        </button>
      </div>
    </Layout>
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
  // 'url' = paste a link; 'file' = upload to storage (ignored when kind='note')
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
      // notes: no url/file required — body and/or title is enough
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
      <p className="border-b border-teal/10 px-5 py-3 text-xs text-ink/40">
        Loading resources…
      </p>
    )
  }

  return (
    <div className="space-y-4 border-b border-teal/10 px-5 py-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">
        Materials &amp; recordings
      </p>

      {/* Existing resources */}
      {resources.length > 0 && (
        <ul className="divide-y divide-teal/10 rounded-lg border border-teal/10">
          {resources.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-3 py-2">
              <span className="shrink-0 rounded bg-teal-light px-1.5 py-0.5 text-xs font-medium text-teal-dark">
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
        {/* Kind + title */}
        <div className="flex gap-2">
          <select
            value={form.kind}
            onChange={(e) => handleKindChange(e.target.value)}
            className={`${inputClass} w-40 shrink-0`}
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
            placeholder={isNote ? 'Title (optional)' : 'Title (optional)'}
            className={inputClass}
          />
        </div>

        {isNote ? (
          /* Note body textarea */
          <textarea
            rows={4}
            value={form.body}
            onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))}
            placeholder="Write your note here…"
            className={`${inputClass} resize-y`}
          />
        ) : (
          <>
            {/* URL / Upload toggle */}
            <div className="flex w-fit overflow-hidden rounded-md border border-teal/20 text-xs font-medium">
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
                className={`border-l border-teal/20 px-3 py-1.5 transition-colors ${
                  mode === 'file'
                    ? 'bg-teal text-white'
                    : 'bg-white text-ink/60 hover:bg-sand hover:text-ink'
                }`}
              >
                Upload file
              </button>
            </div>

            {/* URL input or file picker */}
            {mode === 'url' ? (
              <input
                type="url"
                value={form.url}
                onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))}
                placeholder="https://…"
                className={inputClass}
              />
            ) : (
              <input
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,image/*"
                onChange={(e) => setFileObj(e.target.files?.[0] ?? null)}
                className="block text-sm text-ink/70 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-teal-light file:px-3 file:py-1 file:text-sm file:font-medium file:text-teal-dark"
              />
            )}
          </>
        )}

        {/* Add button on its own line, full-width-ish to match pattern */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleAdd}
            disabled={adding}
            className={`${btnClass} w-auto px-4`}
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
    <Field label="Topic image" id="topic-img">
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
        className="block text-sm text-ink/70 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-teal-light file:px-3 file:py-1 file:text-sm file:font-medium file:text-teal-dark"
      />
    </Field>
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
          : 'text-ink/50 hover:bg-teal-light hover:text-teal'
      }`}
    >
      {children}
    </button>
  )
}
