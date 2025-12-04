import { MessageCircle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TelegramStatusProps {
  isLinked: boolean;
  onConnect: () => void;
}

export default function TelegramStatus({ isLinked, onConnect }: TelegramStatusProps) {
  if (isLinked) {
    return (
      <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
        <CheckCircle className="w-4 h-4" />
        <span>Telegram Connected</span>
      </div>
    );
  }

  return (
    <Button onClick={onConnect} variant="outline" size="sm">
      <MessageCircle className="w-4 h-4 mr-2" />
      Connect Telegram
    </Button>
  );
}

