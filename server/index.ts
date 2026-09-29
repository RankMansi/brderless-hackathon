import express from 'express';
import { api } from './routes';

const app = express();
app.use(express.json());
app.use('/api', api);

const port = Number(process.env.API_PORT ?? 3001);
app.listen(port, () => {
  console.log(`HelpDesk Copilot API listening on http://localhost:${port}`);
  console.log(`LLM provider: ${process.env.LLM_PROVIDER ?? 'mock'}`);
});
