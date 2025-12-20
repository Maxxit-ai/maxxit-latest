import PositionRow from '../PositionRow'

export default function PositionRowExample() {
  return (
    <table className="w-full">
      <thead>
        <tr className="border-b border-border">
          <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">Token</th>
          <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">Entry</th>
          <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">Current</th>
          <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">Qty</th>
          <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">PnL</th>
          <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">Status</th>
          <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">Opened</th>
        </tr>
      </thead>
      <tbody>
        <PositionRow
          id="1"
          tokenSymbol="BTC"
          side="LONG"
          entryPrice={42000}
          currentPrice={45000}
          qty={0.5}
          pnl={1500}
          pnlPercent={7.14}
          status="OPEN"
          openedAt="2025-10-01T10:00:00Z"
        />
        <PositionRow
          id="2"
          tokenSymbol="ETH"
          side="SHORT"
          entryPrice={2800}
          currentPrice={2700}
          qty={5.0}
          pnl={500}
          pnlPercent={3.57}
          status="OPEN"
          openedAt="2025-10-02T14:30:00Z"
        />
        <PositionRow
          id="3"
          tokenSymbol="SOL"
          side="LONG"
          entryPrice={140}
          qty={10.0}
          pnl={-200}
          pnlPercent={-1.43}
          status="CLOSED"
          openedAt="2025-09-28T09:15:00Z"
        />
      </tbody>
    </table>
  )
}
