import { useCallback, useEffect, useState } from 'react';
import type { TicketSummary } from '../shared/types';
import { fetchTickets } from './api';
import { TicketList } from './components/TicketList';
import { TicketView } from './components/TicketView';
import { adjacentTicketId } from './ticketNavigation';

export function App() {
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshTickets = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchTickets()
      .then(setTickets)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(refreshTickets, [refreshTickets]);
  const ids = tickets.map((ticket) => ticket.id);
  const previousId = selectedId ? adjacentTicketId(ids, selectedId, -1) : null;
  const nextId = selectedId ? adjacentTicketId(ids, selectedId, 1) : null;

  return (
    <div className="app">
      <header className="app-header">
        <h1>
          HelpDesk <span className="accent">Copilot</span>
        </h1>
        <p className="tagline">AI-assisted support triage</p>
      </header>
      {error && (
        <div className="error-banner" role="alert">
          Could not load tickets: {error}{' '}
          <button type="button" onClick={refreshTickets}>
            Retry
          </button>
        </div>
      )}
      <div className="layout">
        <TicketList
          tickets={tickets}
          selectedId={selectedId}
          onSelect={setSelectedId}
          loading={loading}
        />
        <main className="detail-pane">
          {selectedId ? (
            <>
              <nav className="ticket-navigation" aria-label="Ticket navigation">
                <button
                  type="button"
                  disabled={!previousId}
                  onClick={() => previousId && setSelectedId(previousId)}
                >
                  ← Previous
                </button>
                <button
                  type="button"
                  disabled={!nextId}
                  onClick={() => nextId && setSelectedId(nextId)}
                >
                  Next →
                </button>
              </nav>
              <TicketView ticketId={selectedId} onTriageComplete={refreshTickets} />
            </>
          ) : (
            <div className="empty-state">
              {loading
                ? 'Loading tickets…'
                : 'Select a ticket to view details and run AI triage.'}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
