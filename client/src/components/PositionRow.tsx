import { Badge } from "@/components/ui/badge";
import StatusBadge from "./StatusBadge";

interface PositionRowProps {
  id: string;
  tokenSymbol: string;
  side: string;
  entryPrice: number;
  currentPrice?: number;
  qty: number;
  pnl?: number;
  pnlPercent?: number;
  status: "OPEN" | "CLOSED";
  openedAt: string;
}

export default function PositionRow({
  id,
  tokenSymbol,
  side,
  entryPrice,
  currentPrice,
  qty,
  pnl,
  pnlPercent,
  status,
  openedAt,
}: PositionRowProps) {
  const isProfitable = pnl && pnl > 0;
  const pnlColor = isProfitable ? "text-primary" : pnl && pnl < 0 ? "text-destructive" : "text-muted-foreground";

  return (
    <tr className="border-b border-border hover-elevate" data-testid={`row-position-${id}`}>
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <span className="font-medium font-mono" data-testid="text-token">{tokenSymbol}</span>
          <Badge variant={side === "LONG" ? "default" : "destructive"} className="text-xs">
            {side}
          </Badge>
        </div>
      </td>
      <td className="py-3 px-4 font-mono text-sm" data-testid="text-entry-price">
        ${entryPrice.toLocaleString()}
      </td>
      <td className="py-3 px-4 font-mono text-sm" data-testid="text-current-price">
        {currentPrice ? `$${currentPrice.toLocaleString()}` : "-"}
      </td>
      <td className="py-3 px-4 font-mono text-sm" data-testid="text-quantity">
        {qty.toFixed(4)}
      </td>
      <td className={`py-3 px-4 font-mono text-sm font-semibold ${pnlColor}`} data-testid="text-pnl">
        {pnl !== undefined && pnlPercent !== undefined ? (
          <div>
            <div>${pnl.toFixed(2)}</div>
            <div className="text-xs">{pnlPercent > 0 ? "+" : ""}{pnlPercent.toFixed(2)}%</div>
          </div>
        ) : (
          "-"
        )}
      </td>
      <td className="py-3 px-4">
        <StatusBadge status={status} />
      </td>
      <td className="py-3 px-4 text-sm text-muted-foreground" data-testid="text-opened-at">
        {new Date(openedAt).toLocaleDateString()}
      </td>
    </tr>
  );
}
