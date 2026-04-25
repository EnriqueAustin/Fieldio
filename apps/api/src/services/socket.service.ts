import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { verifyAccessToken } from '../utils/jwt';

class SocketService {
    private io: Server | null = null;

    public init(httpServer: HttpServer) {
        this.io = new Server(httpServer, {
            cors: {
                origin: config.WEB_URL,
                credentials: true,
            },
            path: '/socket.io',
        });

        this.io.use((socket, next) => {
            const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];

            if (!token) {
                return next(new Error('Authentication error'));
            }

            const decoded = verifyAccessToken(token);
            if (!decoded) {
                return next(new Error('Authentication error'));
            }

            // @ts-ignore
            socket.user = decoded;
            next();
        });

        this.io.on('connection', (socket) => {
            // @ts-ignore
            const user = socket.user;
            logger.info(`User connected: ${user.userId}`);

            // Join Company Room
            socket.join(`company:${user.companyId}`);

            socket.on('disconnect', () => {
                logger.info(`User disconnected: ${user.userId}`);
            });
        });

        logger.info('Socket.io initialized');
    }

    public emitToCompany(companyId: string, event: string, data: any) {
        if (this.io) {
            this.io.to(`company:${companyId}`).emit(event, data);
        }
    }
}

export const socketService = new SocketService();
