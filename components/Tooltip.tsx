import { ReactNode, useState } from 'react';

interface TooltipProps {
  children: ReactNode;
  content: string;
}

export function Tooltip({ children, content }: TooltipProps) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative inline-block">
      <div
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      >
        {children}
      </div>
      {show && (
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 text-sm text-foreground bg-card border border-border rounded-md shadow-lg whitespace-nowrap z-10">
          {content}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1 border-4 border-transparent border-t-border"></div>
        </div>
      )}
    </div>
  );
}
