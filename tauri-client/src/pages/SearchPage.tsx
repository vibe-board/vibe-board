import { useState } from 'react';
import { useSearch } from '@/api/hooks/useSearch';
import { SearchBar } from '@/components/search/SearchBar';
import { SearchResults } from '@/components/search/SearchResults';

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const { data: results, isFetching } = useSearch(
    { q: query },
    { enabled: query.length > 0 },
  );

  return (
    <div className="flex flex-col h-full">
      <SearchBar
        query={query}
        onQueryChange={setQuery}
        isSearching={isFetching}
      />
      <SearchResults results={results ?? []} query={query} />
    </div>
  );
}
