import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
export declare class WalletsService {
    private prisma;
    private config;
    constructor(prisma: PrismaService, config: ConfigService);
    getBalance(userId: string): Promise<{
        balance: any;
        pages: number;
    }>;
    initiateRecharge(userId: string, amount: number, method: string): Promise<{
        paymentUrl: any;
        reference: string;
    }>;
    handleFedaPayWebhook(payload: any): Promise<{
        credited: any;
    } | {
        ignored: boolean;
    }>;
    confirmPayment(reference: string): Promise<{
        credited: any;
    }>;
    credit(userId: string, amount: number, type: string, description: string): Promise<void>;
    history(userId: string, page?: number, limit?: number): Promise<{
        data: any;
        meta: {
            total: any;
            page: number;
            limit: number;
        };
    }>;
}
import { WithdrawalStatus } from '@prisma/client';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';
export declare class WithdrawalsService {
    private prisma;
    private notifications;
    constructor(prisma: PrismaService, notifications: NotificationsService);
    create(userId: string, dto: CreateWithdrawalDto): Promise<any>;
    process(id: string, reference: string, adminNote?: string): Promise<any>;
    fail(id: string, reason: string): Promise<void>;
    findByUser(userId: string): Promise<any>;
    findAll(status?: WithdrawalStatus): Promise<any>;
}
export declare class ChaptersService {
    private prisma;
    private s3;
    constructor(prisma: PrismaService, s3: S3Service);
    create(bookId: string, authorId: string, file: Express.Multer.File, dto: any): Promise<any>;
    getContent(chapterId: string, userId: string): Promise<any>;
    private extractContent;
}
export declare class NotificationsService {
    private prisma;
    constructor(prisma: PrismaService);
    send(userId: string, data: {
        title: string;
        body: string;
        type: string;
        data?: any;
    }): Promise<any>;
    findAll(userId: string): Promise<any>;
    markRead(userId: string, id: string): Promise<any>;
    markAllRead(userId: string): Promise<any>;
    unreadCount(userId: string): Promise<any>;
}
