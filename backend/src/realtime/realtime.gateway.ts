import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  },
})
export class RealtimeGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket) {
    void client;
  }

  @SubscribeMessage('join')
  handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { room?: string },
  ) {
    const room = typeof body?.room === 'string' ? body.room.trim() : '';
    if (!room) return { ok: false };
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
    void client.leave(room);
    return { ok: true, room };
  }

  emitGame(gameId: string, payload: unknown) {
    this.server.to(`game:${gameId}`).emit('game:update', payload);
  }

  emitTournament(tournamentId: string, payload: unknown) {
    this.server
      .to(`tournament:${tournamentId}`)
      .emit('tournament:update', payload);
  }

  emitTournamentList() {
    this.server.to('tournaments').emit('tournaments:list', { at: Date.now() });
  }
}
