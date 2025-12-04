import { Badge } from "@/components/ui/badge";

type Status = "PUBLIC" | "PRIVATE" | "DRAFT" | "OPEN" | "CLOSED" | "CHARGED" | "FAILED" | "ACTIVE" | "PAUSED";

interface StatusBadgeProps {
  status: Status;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const variants: Record<Status, { variant: "default" | "secondary" | "destructive"; label: string }> = {
    PUBLIC: { variant: "default", label: "Public" },
    PRIVATE: { variant: "secondary", label: "Private" },
    OPEN: { variant: "default", label: "Open" },
    CHARGED: { variant: "default", label: "Charged" },
    DRAFT: { variant: "secondary", label: "Draft" },
    CLOSED: { variant: "secondary", label: "Closed" },
    FAILED: { variant: "destructive", label: "Failed" },
    // Legacy support (for backward compatibility)
    ACTIVE: { variant: "default", label: "Public" },
    PAUSED: { variant: "secondary", label: "Private" },
  };

  const { variant, label } = variants[status];

  return (
    <Badge variant={variant} className="rounded-full" data-testid={`badge-status-${status.toLowerCase()}`}>
      {label}
    </Badge>
  );
}
