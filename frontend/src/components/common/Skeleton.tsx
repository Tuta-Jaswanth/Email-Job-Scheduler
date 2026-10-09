import React from 'react';

export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => {
  return <div className={`animate-pulse bg-gray-200/80 dark:bg-gray-800/80 rounded-md ${className}`} />;
};

export const TableSkeleton: React.FC<{ rows?: number }> = ({ rows = 5 }) => {
  return (
    <div className="w-full divide-y divide-gray-100 dark:divide-gray-800 border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden bg-white dark:bg-[#13181d] shadow-sm transition-colors">
      <div className="bg-gray-50/75 dark:bg-[#182026] px-6 py-3.5 flex items-center gap-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-48 hidden md:block" />
        <Skeleton className="h-4 w-28 ml-auto" />
        <Skeleton className="h-4 w-20" />
      </div>
      {Array.from({ length: rows }).map((_, idx) => (
        <div key={idx} className="px-6 py-4 flex items-center gap-4">
          <div className="flex items-center gap-3 w-1/4">
            <Skeleton className="w-8 h-8 rounded-full shrink-0" />
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="flex-1 hidden md:block">
            <Skeleton className="h-4 w-3/4 mb-1.5" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <div className="w-36 text-right">
            <Skeleton className="h-4 w-24 ml-auto" />
          </div>
          <div className="w-24 text-right">
            <Skeleton className="h-6 w-20 rounded-full ml-auto" />
          </div>
        </div>
      ))}
    </div>
  );
};
