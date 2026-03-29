import { WebSocketGateway, SubscribeMessage, MessageBody, WebSocketServer, ConnectedSocket } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ namespace: 'tracking', cors: true })
export class TrackingGateway {
    @WebSocketServer()
    server: Server;

    @SubscribeMessage('join_room')
    handleJoinRoom(@MessageBody() data: { token: string }, @ConnectedSocket() client: Socket) {
        // Implementation: Validate token, join room
        return 'Joined room';
    }
}
