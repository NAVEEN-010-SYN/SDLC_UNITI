import { KeyboardEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { detectIdentifier, groupResults, MIN_QUERY_LENGTH, SearchResult, SearchService } from './searchService';

interface GlobalSearchProps {
  service: SearchService;
  debounceMs?: number;
  onSearch?: (resultCount: number) => void;
}

const GROUP_LABELS: Record<SearchResult['type'], string> = {
  ACCOUNT: 'Accounts',
  SERVICE: 'Services',
  ORDER: 'Orders',
  INVOICE: 'Invoices',
  TICKET: 'Support tickets',
  HELP: 'Help articles',
};

/**
 * Debounced global search across portals. Each keystroke aborts the in-flight
 * request so stale results never overwrite newer ones. Supports keyboard
 * navigation following the ARIA combobox pattern.
 */
export function GlobalSearch({ service, debounceMs = 250, onSearch }: GlobalSearchProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(-1);
  const direct = useMemo(() => detectIdentifier(query), [query]);

  useEffect(() => {
    setActive(-1);
    if (direct || query.trim().length < MIN_QUERY_LENGTH) {
      setResults([]);
      return undefined;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setBusy(true);
      service
        .search(query, controller.signal)
        .then((items) => {
          // Stored in display (grouped) order so keyboard positions match what is shown.
          setResults(groupResults(items).flatMap((g) => g.items));
          onSearch?.(items.length);
        })
        .catch(() => {
          if (!controller.signal.aborted) setResults([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setBusy(false);
        });
    }, debounceMs);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [debounceMs, direct, onSearch, query, service]);

  const options = useMemo(
    () => (direct ? [{ path: direct.path, label: direct.label }] : results.map((r) => ({ path: r.path, label: r.title }))),
    [direct, results],
  );

  const go = (path: string) => {
    setQuery('');
    setResults([]);
    navigate(path);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => Math.min(options.length - 1, i + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => Math.max(-1, i - 1));
    } else if (event.key === 'Enter') {
      const choice = options[active] ?? (direct ? options[0] : undefined);
      if (choice) go(choice.path);
    } else if (event.key === 'Escape') {
      setQuery('');
    }
  };

  const listOpen = options.length > 0;
  return (
    <div className="uce-search" role="search">
      <input
        type="search"
        role="combobox"
        aria-label="Search accounts, invoices, tickets and help"
        aria-expanded={listOpen}
        aria-controls="uce-search-results"
        aria-activedescendant={active >= 0 ? `uce-search-option-${active}` : undefined}
        placeholder="Search or enter ACC-, INV-, TKT- number"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
      />
      {busy && <span role="status">Searching...</span>}
      {listOpen && (
        <ul id="uce-search-results" role="listbox">
          {direct ? (
            <li id="uce-search-option-0" role="option" aria-selected={active === 0} onClick={() => go(direct.path)}>
              {direct.label}
            </li>
          ) : (
            groupResults(results).map((group) => (
              <li key={group.type} role="presentation">
                <span className="uce-search__group">{GROUP_LABELS[group.type]}</span>
                <ul role="group" aria-label={GROUP_LABELS[group.type]}>
                  {group.items.map((item) => {
                    const position = results.indexOf(item);
                    return (
                      <li
                        key={`${item.type}-${item.id}`}
                        id={`uce-search-option-${position}`}
                        role="option"
                        aria-selected={active === position}
                        onClick={() => go(item.path)}
                      >
                        {item.title}
                        {item.subtitle && <small> {item.subtitle}</small>}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
