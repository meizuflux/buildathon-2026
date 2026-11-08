import type { BroadcastTarget, Shelter } from '../api/types'

// The backend supports all families or families assigned to one shelter.
export default function TargetPicker({ target, setTarget, shelters }: {
  target: BroadcastTarget
  setTarget: (target: BroadcastTarget) => void
  shelters: Shelter[]
}) {
  return (
    <div className="target">
      <label className="field">
        <span>Recipients</span>
        <select value={target.type === 'shelter' ? target.shelter_id : ''} onChange={(e) => setTarget(e.target.value ? { type: 'shelter', shelter_id: e.target.value } : { type: 'all' })}>
          <option value="">All families in this disaster</option>
          {shelters.map((s) => <option key={s.id} value={s.id}>Families assigned to {s.name}</option>)}
        </select>
      </label>
      <p className="hint">Choose a shelter to reach families currently assigned to it.</p>
    </div>
  )
}
