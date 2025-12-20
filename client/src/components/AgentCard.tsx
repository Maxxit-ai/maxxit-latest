import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Activity } from "lucide-react";
import StatusBadge from "./StatusBadge";

interface AgentCardProps {
  id: string;
  name: string;
  venue: "SPOT" | "GMX" | "HYPERLIQUID" | "OSTIUM" | "MULTI";
  status: "PUBLIC" | "PRIVATE" | "DRAFT" | "ACTIVE" | "PAUSED"; // PUBLIC/PRIVATE are new, ACTIVE/PAUSED for backward compatibility
  apr30d: number | null;
  sharpe30d: number | null;
  gradientImage: string;
  onDeploy?: (id: string) => void;
  onViewDetails?: (id: string) => void;
}

export default function AgentCard({
  id,
  name,
  venue,
  status,
  apr30d,
  sharpe30d,
  gradientImage,
  onDeploy,
  onViewDetails,
}: AgentCardProps) {
  const venueBadgeColors: Record<string, string> = {
    SPOT: "bg-chart-4/20 text-chart-4 border-chart-4/30",
    GMX: "bg-chart-2/20 text-chart-2 border-chart-2/30",
    HYPERLIQUID: "bg-chart-3/20 text-chart-3 border-chart-3/30",
    OSTIUM: "bg-chart-1/20 text-chart-1 border-chart-1/30",
  };

  return (
    <Card className="overflow-hidden hover-elevate" data-testid={`card-agent-${id}`}>
      <div className="h-24 relative overflow-hidden">
        <img src={gradientImage} alt="" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-card to-transparent" />
      </div>
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-lg" data-testid="text-agent-name">{name}</h3>
          <StatusBadge status={status} />
        </div>
        <Badge className={`w-fit ${venueBadgeColors[venue]}`} data-testid="badge-venue">
          {venue}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
              <TrendingUp className="h-3 w-3" />
              <span>30d APR</span>
            </div>
            <div className="text-xl font-bold font-mono text-primary" data-testid="text-apr">
              {apr30d !== null ? `${apr30d.toFixed(1)}%` : "N/A"}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
              <Activity className="h-3 w-3" />
              <span>Sharpe</span>
            </div>
            <div className="text-xl font-bold font-mono" data-testid="text-sharpe">
              {sharpe30d !== null ? sharpe30d.toFixed(2) : "N/A"}
            </div>
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => onViewDetails?.(id)}
          data-testid="button-view-details"
        >
          View Details
        </Button>
        <Button
          className="flex-1"
          onClick={() => onDeploy?.(id)}
          data-testid="button-deploy"
        >
          Deploy
        </Button>
      </CardFooter>
    </Card>
  );
}
