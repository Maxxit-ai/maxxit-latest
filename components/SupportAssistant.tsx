import { MessageCircle } from 'lucide-react';
import { useState } from 'react';

export default function SupportAssistant() {
  const [isHovered, setIsHovered] = useState(false);
  
  // Get Telegram link from environment variable or use a default
  const telegramLink = 'https://t.me/+Z6XrVtEzvXcyNzll';
  
  const handleClick = () => {
    window.open(telegramLink, '_blank', 'noopener,noreferrer');
  };

  return (
    <div
      className="fixed bottom-6 right-6 z-50"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <button
        onClick={handleClick}
        className="group relative flex items-center gap-2 bg-[var(--accent)] hover:bg-[var(--accent-dim)] text-[var(--bg-deep)] rounded-full sm:p-4 p-2 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-110"
        aria-label="Get Support"
      >
        <MessageCircle className="sm:w-6 sm:h-6 w-5 h-5" />
        <span 
          className={`absolute right-full mr-3 whitespace-nowrap text-xs sm:text-sm bg-[var(--bg-elevated)] text-[var(--text-primary)] sm:px-4 sm:py-2 px-2 py-1 rounded-lg shadow-lg border border-[var(--border)] transition-all duration-300 ${
            isHovered 
              ? 'opacity-100 translate-x-0 pointer-events-auto' 
              : 'opacity-0 translate-x-2 pointer-events-none'
          }`}
        >
          Get Support
        </span>
      </button>
    </div>
  );
}
