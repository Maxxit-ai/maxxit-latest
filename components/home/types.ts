export interface AgentSummary {
  id: string;
  name: string;
  description: string | null;
  venue: string;
  apr30d: number | null;
  apr90d: number | null;
  aprSi: number | null;
  apySi: number | null;
  sharpe30d: number | null;
  totalCost?: number;
  creatorWallet?: string; // For creator-free-join check
  isCopyTradeClub?: boolean;
  cumulativeVolume?: number; 
  cumulativePnl?: number;
}


