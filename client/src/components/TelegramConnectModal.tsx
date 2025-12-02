import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MessageCircle, Copy, CheckCircle, Loader2 } from "lucide-react";

interface TelegramConnectModalProps {
  open: boolean;
  onClose: () => void;
  deploymentId: string;
}

export default function TelegramConnectModal({ open, onClose, deploymentId }: TelegramConnectModalProps) {
  const [linkCode, setLinkCode] = useState<string>("");
  const [botUsername, setBotUsername] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string>("");

  const generateLink = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/telegram/generate-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deploymentId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to generate link code");
      }

      const data = await response.json();
      setLinkCode(data.linkCode);
      setBotUsername(data.botUsername);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(linkCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openTelegram = () => {
    window.open(`https://t.me/${botUsername}`, "_blank");
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-blue-500" />
            Connect Telegram
          </DialogTitle>
          <DialogDescription>
            Link your Safe wallet to Telegram for manual trading
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!linkCode && !loading && (
            <Button onClick={generateLink} className="w-full" size="lg">
              <MessageCircle className="w-4 h-4 mr-2" />
              Generate Link Code
            </Button>
          )}

          {loading && (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          )}

          {linkCode && (
            <div className="space-y-4">
              {/* Step 1 */}
              <div className="border border-border rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Step 1: Copy Code</span>
                  <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                    1 of 3
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-muted px-4 py-3 rounded text-2xl font-mono tracking-wider text-center">
                    {linkCode}
                  </code>
                  <Button
                    onClick={copyCode}
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                  >
                    {copied ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Step 2 */}
              <div className="border border-border rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Step 2: Open Bot</span>
                  <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                    2 of 3
                  </span>
                </div>
                <Button onClick={openTelegram} className="w-full" variant="outline">
                  <MessageCircle className="w-4 h-4 mr-2" />
                  Open @{botUsername}
                </Button>
              </div>

              {/* Step 3 */}
              <div className="border border-border rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Step 3: Link</span>
                  <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                    3 of 3
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Send this message to the bot:
                </p>
                <code className="block bg-muted px-4 py-2 rounded text-sm font-mono">
                  /link {linkCode}
                </code>
              </div>

              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  💡 After linking, you can trade naturally: "Buy 10 USDC of WETH"
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

