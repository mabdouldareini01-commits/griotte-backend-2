import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StartSessionDto } from './dto/start-session.dto';
import { EndSessionDto } from './dto/end-session.dto';
export declare class ReadingService {
    private prisma;
    private notifications;
    constructor(prisma: PrismaService, notifications: NotificationsService);
    startSession(userId: string, dto: StartSessionDto): Promise<{
        sessionId: any;
        pricePerPage: number;
    }>;
    endSession(userId: string, sessionId: string, dto: EndSessionDto): any;
    userHistory(userId: string, page?: number, limit?: number): Promise<{
        data: any;
        meta: {
            total: any;
            page: number;
            limit: number;
        };
    }>;
    getProgress(userId: string, bookId: string): Promise<{
        currentPage: any;
        totalPages: any;
        progressPercent: number;
        totalPagesRead: any;
        totalSpentFcfa: any;
        lastReadAt: any;
    }>;
}
import { ReadingService } from './reading.service';
export declare class ReadingController {
    private reading;
    constructor(reading: ReadingService);
    start(req: any, dto: StartSessionDto): Promise<{
        sessionId: any;
        pricePerPage: number;
    }>;
    end(req: any, id: string, dto: EndSessionDto): any;
    history(req: any, page: number, limit: number): Promise<{
        data: any;
        meta: {
            total: any;
            page: number;
            limit: number;
        };
    }>;
    progress(req: any, bookId: string): Promise<{
        currentPage: any;
        totalPages: any;
        progressPercent: number;
        totalPagesRead: any;
        totalSpentFcfa: any;
        lastReadAt: any;
    }>;
}
export declare class StartSessionDto {
    bookId: string;
    chapterId: string;
    startPage?: number;
}
export declare class EndSessionDto {
    endPage: number;
    duration?: number;
}
