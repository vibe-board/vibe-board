import type { SearchResult } from '@shared/types';
import { EmptyState } from '@/components/ui/EmptyState';
import { File, Folder } from 'lucide-react';

interface SearchResultsProps {
  results: SearchResult[];
  query: string;
}

function getMatchTypeLabel(matchType: string): string {
  switch (matchType) {
    case 'FileName':
      return 'filename';
    case 'DirectoryName':
      return 'directory';
    case 'FullPath':
      return 'path';
    default:
      return matchType;
  }
}

export function SearchResults({ results, query }: SearchResultsProps) {
  if (!query) {
    return (
      <EmptyState
        title="Search files"
        description="Enter a query to search across your project files."
      />
    );
  }

  if (results.length === 0) {
    return (
      <EmptyState
        title="No results found"
        description={`No files matched "${query}".`}
      />
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="flex flex-col divide-y divide-border">
        {results.map((result, index) => {
          const pathParts = result.path.split('/');
          const fileName = pathParts[pathParts.length - 1];
          const dirPath =
            pathParts.length > 1
              ? pathParts.slice(0, -1).join('/')
              : '';

          return (
            <button
              key={`${result.path}-${index}`}
              className="flex items-start gap-3 px-4 py-3 text-left active:bg-muted/50 transition-colors"
            >
              {result.is_file ? (
                <File className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
              ) : (
                <Folder className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{fileName}</p>
                {dirPath && (
                  <p className="text-xs text-muted-foreground truncate">
                    {dirPath}
                  </p>
                )}
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {getMatchTypeLabel(result.match_type)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
