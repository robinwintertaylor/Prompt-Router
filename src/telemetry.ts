import { Response } from 'express';

export interface TelemetryClient {
  id: string;
  res: Response;
  connectedAt: number;
}

const clients = new Map<string, TelemetryClient>();

export function addTelemetryClient(id: string, res: Response) {
  clients.set(id, { id, res, connectedAt: Date.now() });
}

export function removeTelemetryClient(id: string) {
  clients.delete(id);
}

export function getConnectedClientCount(): number {
  return clients.size;
}

export function broadcastTelemetry(event: string, data: any) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const [id, client] of clients.entries()) {
    try {
      if (client.res.writable && !client.res.writableEnded) {
        client.res.write(payload);
      } else {
        clients.delete(id);
      }
    } catch {
      clients.delete(id);
    }
  }
}
