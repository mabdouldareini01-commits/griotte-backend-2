import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { OtpService } from './otp.service';
export declare class AuthController {
    private prisma;
    private jwt;
    private otp;
    constructor(prisma: PrismaService, jwt: JwtService, otp: OtpService);
    register(body: {
        email: string;
        password: string;
        name: string;
        role: string;
    }): Promise<{
        accessToken: string;
        refreshToken: string;
        role: import(".prisma/client").$Enums.Role;
    }>;
    login(body: {
        email: string;
        password: string;
    }): Promise<{
        accessToken: string;
        refreshToken: string;
        role: import(".prisma/client").$Enums.Role;
    }>;
    getMe(auth: string): Promise<{
        name: string;
        email: string;
        role: import(".prisma/client").$Enums.Role;
        balance: number;
    }>;
    recharge(auth: string, body: {
        amount: number;
    }): Promise<{
        balance: number;
    }>;
    getBooks(): Promise<({
        author: {
            name: string;
        };
    } & {
        id: string;
        country: string | null;
        createdAt: Date;
        updatedAt: Date;
        authorId: string;
        title: string;
        subtitle: string | null;
        synopsis: string;
        coverColor: string;
        coverImage: string | null;
        genre: string;
        subGenre: string | null;
        language: string;
        tags: string[];
        targetAudience: string;
        sensitiveContent: string;
        totalPages: number;
        authorNote: string | null;
        status: import(".prisma/client").$Enums.BookStatus;
        publishedAt: Date | null;
        scheduledAt: Date | null;
        rejectionNote: string | null;
        isPublic: boolean;
        isFreeFirst: boolean;
        yearWritten: number | null;
        totalReads: number;
        totalRevenue: number;
        averageRating: number;
        reviewCount: number;
    })[]>;
    googleAuth(res: any): Promise<any>;
    googleCallback(code: string, res: any): Promise<any>;
}
