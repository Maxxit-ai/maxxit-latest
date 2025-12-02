import MetricCard from '../MetricCard'
import { TrendingUp, DollarSign, Activity } from 'lucide-react'

export default function MetricCardExample() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <MetricCard
        title="30d APR"
        value="42.5%"
        subtitle="vs 38.2% last period"
        icon={TrendingUp}
        trend="up"
      />
      <MetricCard
        title="Total PnL"
        value="$12,450"
        subtitle="+15.3% this month"
        icon={DollarSign}
        trend="up"
      />
      <MetricCard
        title="Active Positions"
        value="8"
        subtitle="across 3 venues"
        icon={Activity}
        trend="neutral"
      />
    </div>
  )
}
