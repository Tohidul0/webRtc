import { WebSocketGateway, WebSocketServer, OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';

@WebSocketGateway({ cors: true })
export class SignalingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private rooms: Map<string, Set<string>> = new Map(); // roomId -> Set of clientIds

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
    // Clean up rooms when a client disconnects
    this.rooms.forEach((clients, roomId) => {
      if (clients.has(client.id)) {
        clients.delete(client.id);
        client.leave(roomId);
        if (clients.size === 0) {
          this.rooms.delete(roomId);
        } else {
          // Notify remaining clients about the disconnection
          client.to(roomId).emit('peer-disconnected', { peerId: client.id });
        }
      }
    });
  }

  @SubscribeMessage('join-room')
  handleJoinRoom(client: Socket, roomId: string) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Set());
    }

    const roomClients = this.rooms.get(roomId);
    if (!roomClients) return; // Add this check

    roomClients.add(client.id);
    client.join(roomId);

    // Notify the client about all existing peers in the room
    // Updated this line to handle potential undefined
    const peers = roomClients ? Array.from(roomClients).filter(id => id !== client.id) : [];
    client.emit('peers-list', { peers });

    console.log(`Client ${client.id} joined room ${roomId}`);
  }

  @SubscribeMessage('leave-room')
  handleLeaveRoom(client: Socket, roomId: string) {
    const roomClients = this.rooms.get(roomId);
    if (!roomClients) return; // Add this check

    roomClients.delete(client.id);
    client.leave(roomId);

    if (roomClients.size === 0) {
      this.rooms.delete(roomId);
    }
    console.log(`Client ${client.id} left room ${roomId}`);
  }

  @SubscribeMessage('signal')
  handleSignal(client: Socket, payload: { to: string; data: any }) {
    client.to(payload.to).emit('signal', { from: client.id, data: payload.data });
  }
}