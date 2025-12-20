import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon?: LucideIcon;
  trend?: "up" | "down" | "neutral";
}

export default function MetricCard({ title, value, subtitle, icon: Icon, trend }: MetricCardProps) {
  const trendColor = trend === "up" ? "text-primary" : trend === "down" ? "text-destructive" : "text-muted-foreground";

  return (
    <Card data-testid={`card-metric-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold font-mono ${trendColor}`} data-testid="text-metric-value">
          {value}
        </div>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-1" data-testid="text-metric-subtitle">
            {subtitle}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
