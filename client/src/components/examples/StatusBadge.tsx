import StatusBadge from '../StatusBadge'

export default function StatusBadgeExample() {
  return (
    <div className="flex gap-2 flex-wrap">
      <StatusBadge status="ACTIVE" />
      <StatusBadge status="PAUSED" />
      <StatusBadge status="DRAFT" />
      <StatusBadge status="OPEN" />
      <StatusBadge status="CLOSED" />
      <StatusBadge status="CHARGED" />
      <StatusBadge status="FAILED" />
    </div>
  )
}
