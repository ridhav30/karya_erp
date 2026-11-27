import { useState } from 'react'
import { useFrappeGetCall } from 'frappe-react-sdk'
import { Award, CheckCheck, PenLine, Send, Target } from 'lucide-react'
import Button from '../Button.jsx'
import Modal from '../Modal.jsx'
import StarRating from '../fields/StarRating.jsx'
import StageTracker from './StageTracker.jsx'
import { useCall } from '../../lib/useCall.js'
import { useToast } from '../../app/toast-context.js'
import { errorText } from '../../lib/errors.js'
import { formatNumber } from '../../lib/format.js'
import { cn } from '../../lib/utils.js'

const stars = (score) => formatNumber(Number(score) || 0, 1)

function SelfAppraisalDialog({ appraisal, onClose, onDone }) {
  const call = useCall()
  const toast = useToast()
  const [ratings, setRatings] = useState(() => Object.fromEntries(appraisal.self_ratings.map((r) => [r.criteria, Number(r.rating) || 0])))
  const [reflections, setReflections] = useState(appraisal.reflections || '')
  const [busy, setBusy] = useState(false)
  const complete = appraisal.self_ratings.every((r) => ratings[r.criteria] > 0)

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    try {
      await call.post('karya_erp.performance.save_self', {
        appraisal: appraisal.name, reflections,
        ratings: JSON.stringify(Object.entries(ratings).map(([criteria, rating]) => ({ criteria, rating }))),
      })
      toast({ tone: 'success', title: complete ? 'Self-appraisal sent to your manager' : 'Saved — finish rating every item to send it' })
      onDone?.()
      onClose()
    } catch (err) {
      toast({ tone: 'error', title: 'Could not save', description: errorText(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal as="form" onSubmit={save} size="max-w-3xl" icon={PenLine} tone="amber" title="Self-appraisal" subtitle={appraisal.cycle.cycle_name || appraisal.cycle.name}
      onClose={() => !busy && onClose()} bodyClassName="space-y-4"
      footer={<>
          {!complete && <span className="me-auto text-[11px] text-muted">Rate every item to send it to your manager.</span>}
          <Button type="button" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" variant="primary" icon={Send} loading={busy}>{complete ? 'Send' : 'Save draft'}</Button>
      </>}>
          <p className="text-xs text-muted">Rate yourself on each item (1 = needs improvement, 5 = outstanding).</p>
          {appraisal.self_ratings.length === 0 && <p className="text-xs text-danger">This appraisal has no rating criteria — ask HR to check the appraisal template.</p>}
          <ul className="divide-y rounded-lg border">
            {appraisal.self_ratings.map((r) => (
              <li key={r.criteria} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0"><p className="text-xs font-medium">{r.criteria}</p><p className="text-[11px] text-muted">{formatNumber(r.per_weightage)}% weight</p></div>
                <StarRating value={ratings[r.criteria]} onChange={(v) => setRatings((x) => ({ ...x, [r.criteria]: v }))} label={r.criteria} />
              </li>
            ))}
          </ul>
          <label className="block space-y-1.5">
            <span className="label">Reflections</span>
            <textarea rows={5} value={reflections} onChange={(e) => setReflections(e.target.value)} className="input h-auto resize-y py-2" placeholder="What went well this year, what you'd like to improve, support you need…" />
          </label>
    </Modal>
  )
}

/** My HR card: current appraisal — stage, goals with progress, self-appraisal, scores and feedback. */
export default function MyPerformance() {
  const call = useCall()
  const toast = useToast()
  const { data, isLoading, mutate } = useFrappeGetCall('karya_erp.performance.my_appraisal', undefined, 'my-appraisal', { revalidateOnFocus: false })
  const a = data?.message?.current
  const [editing, setEditing] = useState(false)
  const [progress, setProgress] = useState({})

  async function saveGoal(g) {
    const value = progress[g.name]
    if (value == null || Number(value) === Number(g.progress)) return
    try {
      await call.post('karya_erp.performance.update_goal', { goal: g.name, progress: value })
      await mutate()
    } catch (e) {
      toast({ tone: 'error', title: 'Could not update goal', description: errorText(e) })
    }
  }

  async function acknowledge() {
    try {
      await call.post('karya_erp.performance.acknowledge', { appraisal: a.name })
      toast({ tone: 'success', title: 'Appraisal acknowledged' })
      await mutate()
    } catch (e) {
      toast({ tone: 'error', title: 'Could not acknowledge', description: errorText(e) })
    }
  }

  return (
    <section className="card overflow-hidden lg:col-span-2">
      <div className="dt-bar">
        <h3 className="dt-title flex items-center gap-2"><Award className="size-3.5 text-muted" />Performance{a && <span className="font-normal text-muted">· {a.cycle.cycle_name || a.cycle.name}</span>}</h3>
        {a?.stage === 'Self Appraisal' && <Button size="sm" variant="primary" icon={PenLine} onClick={() => setEditing(true)}>Self-appraisal</Button>}
        {a?.stage === 'To Acknowledge' && <Button size="sm" variant="primary" icon={CheckCheck} onClick={acknowledge}>Acknowledge</Button>}
      </div>
      {isLoading ? <div className="h-24 animate-pulse" /> : !a ? (
        <p className="px-4 py-6 text-center text-xs text-muted">No appraisal yet. HR starts the yearly cycle.</p>
      ) : (
        <div className="space-y-4 p-4">
          <StageTracker stage={a.stage} />

          {a.docstatus === 1 && (
            <div className="grid grid-cols-3 gap-2 text-center">
              {[['Final score', a.scores.final_score], ['Self', a.scores.self_score], ['Feedback', a.scores.avg_feedback_score]].map(([l, v]) => (
                <div key={l} className="rounded-md bg-surface-2 py-2 dark:bg-zinc-900"><p className="num text-base font-semibold">{stars(v)}<span className="text-xs font-normal text-muted"> / 5</span></p><p className="text-[11px] text-muted">{l}</p></div>
              ))}
            </div>
          )}

          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted"><Target className="size-3.5" />Goals</p>
            {a.goals.length === 0 ? <p className="text-xs text-muted">No goals set for this cycle.</p> : (
              <ul className="space-y-2.5">
                {a.goals.map((g) => {
                  const v = progress[g.name] ?? g.progress ?? 0
                  const editable = a.docstatus === 0 && !Number(g.is_group)
                  return (
                    <li key={g.name} className="text-xs">
                      <div className="mb-1 flex items-baseline justify-between gap-2">
                        <span className="min-w-0 truncate font-medium">{g.goal_name}{g.kra && <span className="font-normal text-muted"> · {g.kra}</span>}</span>
                        <span className="num shrink-0 text-muted">{formatNumber(v)}%</span>
                      </div>
                      {editable ? (
                        <input type="range" min="0" max="100" step="5" value={v} aria-label={`Progress of ${g.goal_name}`}
                          onChange={(e) => setProgress((x) => ({ ...x, [g.name]: Number(e.target.value) }))}
                          onPointerUp={() => saveGoal(g)} onKeyUp={() => saveGoal(g)} onBlur={() => saveGoal(g)}
                          className="w-full accent-[var(--primary)]" />
                      ) : (
                        <span className="block h-1.5 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full bg-series-1" style={{ width: `${v}%` }} /></span>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {a.self_ratings.length > 0 && a.stage !== 'Self Appraisal' && (
            <div>
              <p className="mb-2 text-xs font-semibold text-muted">My self-ratings</p>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {a.self_ratings.map((r) => <li key={r.criteria} className="flex items-center justify-between gap-2 text-xs"><span className="truncate">{r.criteria}</span><StarRating value={r.rating} size="sm" label={r.criteria} /></li>)}
              </ul>
            </div>
          )}

          {a.docstatus === 1 && a.feedback.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold text-muted">Feedback</p>
              <ul className="space-y-2">
                {a.feedback.map((f) => (
                  <li key={f.name} className={cn('rounded-md border p-3 text-xs')}>
                    <p className="font-medium">{f.reviewer_name || f.reviewer} <span className="num font-normal text-muted">· {stars(f.total_score)} / 5</span></p>
                    {f.feedback && <p className="mt-1 whitespace-pre-line text-muted">{f.feedback}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {editing && a && <SelfAppraisalDialog appraisal={a} onClose={() => setEditing(false)} onDone={mutate} />}
    </section>
  )
}
