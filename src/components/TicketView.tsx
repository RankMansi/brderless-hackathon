import { useEffect, useRef, useState } from 'react';
import type { Ticket, TriageResult } from '../../shared/types';
import { fetchTicket, fetchTriage, generateTriage } from '../api';
import { shouldApplyTriage } from '../triageFreshness';
import { TriagePanel } from './TriagePanel';

interface Props {
  ticketId: string;
  onTriageComplete: () => void;
}

export function TicketView({ ticketId, onTriageComplete }: Props) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [triage, setTriage] = useState<TriageResult | null>(null);
  const [triageLoading, setTriageLoading] = useState(false);
  const [triageError, setTriageError] = useState<string | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    const gen = ++generation.current;
    const requestedId = ticketId;
    setTicket(null);
    setTriage(null);
    setTriageLoading(true);
    setTriageError(null);

    fetchTicket(requestedId)
      .then((next) => {
        if (generation.current === gen) setTicket(next);
      })
      .catch(() => {
        if (generation.current === gen) setTicket(null);
      });

    // Load the existing triage, or generate one on first view.
    // Clear the previous ticket's result first, and drop responses that
    // arrive after the agent has switched tickets or clicked Regenerate.
    fetchTriage(requestedId)
      .catch(() =>
        generateTriage(requestedId).then((r) => {
          // The result is already stored for this ticket, so the list should
          // refresh even if the agent has moved on. The detail pane stays gated.
          onTriageComplete();
          return r;
        })
      )
      .then((result) => {
        if (shouldApplyTriage(requestedId, result, gen, generation.current)) setTriage(result);
      })
      .catch((e: Error) => {
        if (generation.current === gen) setTriageError(e.message);
      })
      .finally(() => {
        if (generation.current === gen) setTriageLoading(false);
      });
  }, [ticketId, onTriageComplete]);

  const regenerate = () => {
    const gen = ++generation.current;
    const requestedId = ticketId;
    setTriageLoading(true);
    setTriageError(null);
    generateTriage(requestedId)
      .then((result) => {
        onTriageComplete();
        if (!shouldApplyTriage(requestedId, result, gen, generation.current)) return;
        setTriage(result);
      })
      .catch((e: Error) => {
        if (generation.current === gen) setTriageError(e.message);
      })
      .finally(() => {
        if (generation.current === gen) setTriageLoading(false);
      });
  };

  if (!ticket) return <div className="empty-state">Loading ticket…</div>;

  return (
    <div className="ticket-view">
      <section className="ticket-details card">
        <div className="ticket-details-header">
          <h2>{ticket.subject}</h2>
          <span className="ticket-id">{ticket.id}</span>
        </div>
        <dl className="customer-meta">
          <div>
            <dt>Customer</dt>
            <dd>
              {ticket.customer.name} ({ticket.customer.email})
            </dd>
          </div>
          <div>
            <dt>Plan</dt>
            <dd className={`plan plan-${ticket.customer.plan}`}>{ticket.customer.plan}</dd>
          </div>
          <div>
            <dt>Monthly spend</dt>
            <dd>${ticket.customer.monthlySpendUsd}</dd>
          </div>
          {ticket.purchaseDate && (
            <div>
              <dt>Purchase date</dt>
              <dd>{new Date(ticket.purchaseDate).toLocaleDateString()}</dd>
            </div>
          )}
        </dl>
        <h3>Customer message</h3>
        <blockquote className="customer-message">{ticket.message}</blockquote>
        {ticket.internalNotes.length > 0 && (
          <>
            <h3>
              Internal notes <span className="internal-tag">internal only</span>
            </h3>
            <ul className="internal-notes">
              {ticket.internalNotes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </>
        )}
      </section>

      <TriagePanel
        triage={triage}
        loading={triageLoading}
        error={triageError}
        onRegenerate={regenerate}
      />
    </div>
  );
}
