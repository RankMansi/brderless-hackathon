import { Router } from 'express';
import type { TicketSummary } from '../shared/types';
import { db, getTicket } from './store';
import { toTriageHttpError } from './httpErrors';
import { runTriage } from './triage/triageService';

export const api = Router();

api.get('/tickets', (_req, res) => {
  const summaries: TicketSummary[] = db.tickets.map((t) => {
    const triage = db.triageResults.get(t.id);
    return {
      id: t.id,
      subject: t.subject,
      customerName: t.customer.name,
      plan: t.customer.plan,
      status: t.status,
      createdAt: t.createdAt,
      lastTriage: triage
        ? {
            category: triage.category,
            urgency: triage.urgency,
            escalate: triage.escalate,
          }
        : undefined,
    };
  });
  res.json(summaries);
});

api.get('/tickets/:id', (req, res) => {
  const ticket = getTicket(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  res.json(ticket);
});

api.get('/tickets/:id/triage', (req, res) => {
  const result = db.triageResults.get(req.params.id);
  if (!result) return res.status(404).json({ error: 'No triage result yet' });
  res.json(result);
});

api.post('/tickets/:id/triage', async (req, res) => {
  const ticket = getTicket(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  try {
    const result = await runTriage(ticket);
    res.json(result);
  } catch (err) {
    const response = toTriageHttpError(err);
    res.status(response.status).json({ error: response.message });
  }
});

api.get('/policies', (_req, res) => {
  res.json(db.policies.map(({ id, title, status, audience, updatedAt }) => ({
    id, title, status, audience, updatedAt,
  })));
});
