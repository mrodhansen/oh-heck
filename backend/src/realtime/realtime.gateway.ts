import { OnModuleDestroy } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import type { LiveService } from '../live/live.service';
import { LivePresence, parseLiveRoom } from '../live/live-presence';
import { LIVE_SERVICE } from '../live/live.tokens';

@WebSocketGateway({
  cors: {
    origin: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  },
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  @WebSocketServer()
  server!: Server;

  private readonly presence = new LivePresence((drop) => {
    void this.live().dropIfUnsubscribed(drop.sessionId, drop.playerId);
  });

  constructor(private readonly moduleRef: ModuleRef) {}

  private live(): LiveService {
    return this.moduleRef.get<LiveService>(LIVE_SERVICE, { strict: false });
  }

  handleConnection(client: Socket) {
    void client;
  }

  handleDisconnect(client: Socket) {
    this.presence.unbind(client.id);
  }

  onModuleDestroy() {
    this.presence.dispose();
  }

  @SubscribeMessage('join')
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { room?: string; token?: string },
  ) {
    const room = typeof body?.room === 'string' ? body.room.trim() : '';
    if (!room) return { ok: false };
    const sessionId = parseLiveRoom(room);
    if (sessionId) {
      const token = typeof body?.token === 'string' ? body.token : '';
      const identified = await this.live().identifyLiveSocket(sessionId, token);
      if (!identified) return { ok: false };
      this.presence.bind(client.id, sessionId, identified.playerId);
    }
    void client.join(room);
    return { ok: true, room };
  }

  @SubscribeMessage('leave')
  handleLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { room?: string },
  ) {
    const room = typeof body?.room === 'string' ? body.room.trim() : '';
    if (!room) return { ok: false };
    if (parseLiveRoom(room)) this.presence.unbind(client.id);
    void client.leave(room);
    return { ok: true, room };
  }

  emitGame(gameId: string, payload: { id: string }) {
    this.server.to(`game:${gameId}`).emit('game:update', payload);
  }

  emitTournament(tournamentId: string, payload: { id: string }) {
    this.server
      .to(`tournament:${tournamentId}`)
      .emit('tournament:update', payload);
  }

  emitTournamentList() {
    this.server.to('tournaments').emit('tournaments:list', { at: Date.now() });
  }

  emitLive(sessionId: string, payload: { at: number; sessionId: string }) {
    this.server.to(`live:${sessionId}`).emit('live:update', payload);
  }
}
