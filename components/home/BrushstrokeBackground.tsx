import React, { ReactNode } from 'react';

interface BrushstrokeBackgroundProps {
  children: ReactNode;
  className?: string;
}

export default function BrushstrokeBackground({ children, className = '' }: BrushstrokeBackgroundProps) {
  return (
    <span className={`relative top inline-block ${className}`}>
      {/* Enhanced diagonal brushstroke background - fitted to image width */}
      <div className="absolute top-1 -bottom-2 left-2 inset-0 overflow-visible pointer-events-none">

        {/* Main brushstroke layer - top */}
        <div
          className="absolute bg-white"
          style={{
            left: '-5%',
            top: '-10%',
            width: '110%',
            height: '40%',
            transform: 'rotate(-6deg)',
            clipPath: `polygon(
              0% 30%, 3% 25%, 7% 22%, 12% 19%, 18% 16%, 25% 14%, 32% 12%, 40% 11%, 
              48% 10%, 52% 10%, 60% 11%, 68% 12%, 75% 14%, 82% 16%, 88% 19%, 93% 22%, 
              97% 25%, 100% 30%, 100% 35%, 98% 40%, 100% 45%, 98% 50%, 100% 55%, 
              98% 60%, 100% 65%, 97% 70%, 93% 73%, 88% 76%, 82% 79%, 75% 81%, 
              68% 83%, 60% 84%, 52% 84%, 48% 84%, 40% 84%, 32% 83%, 25% 81%, 
              18% 79%, 12% 76%, 7% 73%, 3% 70%, 0% 65%, 0% 60%, 2% 55%, 0% 50%, 
              2% 45%, 0% 40%, 2% 35%
            )`,
            filter: 'blur(0.5px)',
            opacity: 0.96,
          }}
        ></div>

        {/* Main stroke - soft edge layer */}
        <div
          className="absolute bg-white"
          style={{
            left: '-5%',
            top: '-10%',
            width: '110%',
            height: '40%',
            transform: 'rotate(-6deg)',
            clipPath: `polygon(
              -2% 31%, 1% 26%, 5% 23%, 10% 20%, 16% 17%, 23% 15%, 30% 13%, 38% 12%, 
              46% 11%, 50% 11%, 58% 12%, 66% 13%, 73% 15%, 80% 17%, 86% 20%, 91% 23%, 
              95% 26%, 102% 31%, 102% 36%, 100% 41%, 102% 46%, 100% 51%, 102% 56%, 
              100% 61%, 102% 66%, 95% 71%, 91% 74%, 86% 77%, 80% 80%, 73% 82%, 
              66% 84%, 58% 85%, 50% 85%, 46% 85%, 38% 85%, 30% 84%, 23% 82%, 
              16% 80%, 10% 77%, 5% 74%, 1% 71%, -2% 66%, -2% 61%, 0% 56%, -2% 51%, 
              0% 46%, -2% 41%, 0% 36%
            )`,
            filter: 'blur(1.8px)',
            opacity: 0.55,
          }}
        ></div>

        {/* Middle brushstroke layer */}
        <div
          className="absolute bg-white"
          style={{
            left: '-5%',
            top: '15%',
            width: '110%',
            height: '40%',
            transform: 'rotate(-6deg)',
            clipPath: `polygon(
              0% 32%, 3% 27%, 7% 24%, 12% 21%, 18% 18%, 25% 16%, 32% 14%, 40% 13%, 
              48% 12%, 52% 12%, 60% 13%, 68% 14%, 75% 16%, 82% 18%, 88% 21%, 93% 24%, 
              97% 27%, 100% 32%, 100% 37%, 98% 42%, 100% 47%, 98% 52%, 100% 57%, 
              98% 62%, 100% 67%, 97% 72%, 93% 75%, 88% 78%, 82% 81%, 75% 83%, 
              68% 85%, 60% 86%, 52% 86%, 48% 86%, 40% 86%, 32% 85%, 25% 83%, 
              18% 81%, 12% 78%, 7% 75%, 3% 72%, 0% 67%, 0% 62%, 2% 57%, 0% 52%, 
              2% 47%, 0% 42%, 2% 37%
            )`,
            filter: 'blur(0.4px)',
            opacity: 0.94,
          }}
        ></div>

        {/* Middle stroke - texture layer */}
        <div
          className="absolute bg-white"
          style={{
            left: '-5%',
            top: '15%',
            width: '110%',
            height: '40%',
            transform: 'rotate(-6.2deg)',
            clipPath: `polygon(
              1% 33%, 4% 28%, 8% 25%, 13% 22%, 19% 19%, 26% 17%, 33% 15%, 41% 14%, 
              49% 13%, 51% 13%, 59% 14%, 67% 15%, 74% 17%, 81% 19%, 87% 22%, 92% 25%, 
              96% 28%, 99% 33%, 99% 38%, 97% 43%, 99% 48%, 97% 53%, 99% 58%, 
              97% 63%, 99% 68%, 96% 73%, 92% 76%, 87% 79%, 81% 82%, 74% 84%, 
              67% 86%, 59% 87%, 51% 87%, 49% 87%, 41% 87%, 33% 86%, 26% 84%, 
              19% 82%, 13% 79%, 8% 76%, 4% 73%, 1% 68%, 1% 63%, 3% 58%, 1% 53%, 
              3% 48%, 1% 43%, 3% 38%
            )`,
            filter: 'blur(0.8px)',
            opacity: 0.75,
          }}
        ></div>

        {/* Bottom brushstroke layer */}
        <div
          className="absolute bg-white"
          style={{
            left: '-5%',
            top: '40%',
            width: '110%',
            height: '40%',
            transform: 'rotate(-6deg)',
            clipPath: `polygon(
              0% 34%, 3% 29%, 7% 26%, 12% 23%, 18% 20%, 25% 18%, 32% 16%, 40% 15%, 
              48% 14%, 52% 14%, 60% 15%, 68% 16%, 75% 18%, 82% 20%, 88% 23%, 93% 26%, 
              97% 29%, 100% 34%, 100% 39%, 98% 44%, 100% 49%, 98% 54%, 100% 59%, 
              98% 64%, 100% 69%, 97% 74%, 93% 77%, 88% 80%, 82% 83%, 75% 85%, 
              68% 87%, 60% 88%, 52% 88%, 48% 88%, 40% 88%, 32% 87%, 25% 85%, 
              18% 83%, 12% 80%, 7% 77%, 3% 74%, 0% 69%, 0% 64%, 2% 59%, 0% 54%, 
              2% 49%, 0% 44%, 2% 39%
            )`,
            filter: 'blur(0.5px)',
            opacity: 0.95,
          }}
        ></div>

        {/* Bottom stroke - soft overlay */}
        <div
          className="absolute bg-white"
          style={{
            left: '-5%',
            top: '40%',
            width: '110%',
            height: '40%',
            transform: 'rotate(-5.8deg)',
            clipPath: `polygon(
              -2% 33%, 1% 28%, 5% 25%, 10% 22%, 16% 19%, 23% 17%, 30% 15%, 38% 14%, 
              46% 13%, 50% 13%, 58% 14%, 66% 15%, 73% 17%, 80% 19%, 86% 22%, 91% 25%, 
              95% 28%, 102% 33%, 102% 38%, 100% 43%, 102% 48%, 100% 53%, 102% 58%, 
              100% 63%, 102% 68%, 95% 73%, 91% 76%, 86% 79%, 80% 82%, 73% 84%, 
              66% 86%, 58% 87%, 50% 87%, 46% 87%, 38% 87%, 30% 86%, 23% 84%, 
              16% 82%, 10% 79%, 5% 76%, 1% 73%, -2% 68%, -2% 63%, 0% 58%, -2% 53%, 
              0% 48%, -2% 43%, 0% 38%
            )`,
            filter: 'blur(1.5px)',
            opacity: 0.5,
          }}
        ></div>

      </div>

      {/* Content overlay */}
      <div className="relative z-10">
        {children}
      </div>
    </span>
  );
}