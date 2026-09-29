import { useState } from 'react';
import type { TicketSummary } from '../../shared/types';

const URGENCY_FILTERS = ['all', 'high', 'medium', 'low'] as const;
type UrgencyFilter = (typeof URGENCY_FILTERS)[number];

interface Props {
  tickets: TicketSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
}

export function TicketList({ tickets, selectedId, onSelect, loading }: Props) {
  const [filter, setFilter] = useState<UrgencyFilter>('all');

  const visible =
    filter === 'all'
      ? tickets
      : tickets.filter((t) => t.lastTriage?.urgency === filter);

  return (
    <aside className="ticket-list">
      <div className="list-toolbar">
        <span className="list-count">{visible.length} tickets</span>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as UrgencyFilter)}
          aria-label="Filter by urgency"
        >
          {URGENCY_FILTERS.map((f) => (
            <option key={f} value={f}>
              {f === 'all' ? 'All urgencies' : `Urgency: ${f}`}
            </option>
          ))}
        </select>
      </div>
      <ul>
        {loading && tickets.length === 0 && (
          <li className="list-empty" aria-live="polite">
            Loading tickets…
          </li>
        )}
        {!loading && visible.length === 0 && (
          <li className="list-empty">No tickets match this urgency.</li>
        )}
        {visible.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              className={`ticket-item ${t.id === selectedId ? 'selected' : ''}`}
              aria-current={t.id === selectedId ? 'true' : undefined}
              onClick={() => onSelect(t.id)}
            >
              <span className="ticket-item-top">
                <span className="ticket-id">{t.id}</span>
                {t.lastTriage && (
                  <span className={`badge badge-${t.lastTriage.urgency}`}>
                    {t.lastTriage.urgency}
                  </span>
                )}
                {t.lastTriage?.escalate && (
                  <span className="badge badge-escalate">escalate</span>
                )}
              </span>
              <span className="ticket-subject">{t.subject}</span>
              <span className="ticket-meta">
                {t.customerName} · <span className={`plan plan-${t.plan}`}>{t.plan}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
