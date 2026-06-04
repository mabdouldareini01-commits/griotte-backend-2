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
        error: string;
        balance: number;
    } | {
        balance: number;
        error?: undefined;
    }>;
    getWalletBalance(auth: string): Promise<{
        balance: number;
    }>;
    publishBook(auth: string, body: {
        title: string;
        synopsis: string;
        genre: string;
        totalPages: number;
        tags?: string[];
        coverImage?: string;
    }): Promise<{
        id: string;
        country: string | null;
        createdAt: Date;
        updatedAt: Date;
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
        authorId: string;
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
        authorId: string;
    })[]>;
    getMyBooks(auth: string): Promise<{
        id: string;
        country: string | null;
        createdAt: Date;
        updatedAt: Date;
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
        authorId: string;
    }[]>;
    getMyStats(auth: string): Promise<{
        totalBooks: number;
        totalPages: any;
        totalReaders: number;
        totalRevenue: number;
        books: {
            id: string;
            country: string | null;
            createdAt: Date;
            updatedAt: Date;
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
            authorId: string;
        }[];
    } | {
        totalBooks: number;
        totalPages: number;
        books: any[];
        totalReaders?: undefined;
        totalRevenue?: undefined;
    }>;
    googleAuth(res: any): Promise<any>;
    googleCallback(code: string, res: any): Promise<any>;
    getBookChapters(bookId: string): Promise<{
        number: number;
        id: string;
        title: string;
        content: string;
        pageCount: number;
        wordCount: number;
        isFree: boolean;
    }[]>;
    addChapter(bookId: string, auth: string, body: {
        title: string;
        content: string;
        number: number;
        isFree?: boolean;
    }): Promise<{
        number: number;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        bookId: string;
        content: string | null;
        fileUrl: string | null;
        pageCount: number;
        wordCount: number;
        isFree: boolean;
        isPublished: boolean;
    } | {
        error: any;
    }>;
    updateChapter(bookId: string, chapterId: string, auth: string, body: any): Promise<{
        number: number;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        bookId: string;
        content: string | null;
        fileUrl: string | null;
        pageCount: number;
        wordCount: number;
        isFree: boolean;
        isPublished: boolean;
    } | {
        error: any;
    }>;
    getAdminUsers(auth: string): Promise<({
        wallet: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            balance: number;
            userId: string;
        };
    } & {
        id: string;
        email: string;
        password: string | null;
        googleId: string | null;
        name: string;
        avatar: string | null;
        verified: boolean;
        country: string | null;
        role: import(".prisma/client").$Enums.Role;
        isVerified: boolean;
        isSuspended: boolean;
        suspendedAt: Date | null;
        suspendReason: string | null;
        createdAt: Date;
        updatedAt: Date;
        lastLoginAt: Date | null;
    })[] | {
        error: string;
    }>;
    getAdminStats(auth: string): Promise<{
        error: string;
        totalUsers?: undefined;
        totalBooks?: undefined;
        totalAuthors?: undefined;
        totalReaders?: undefined;
        totalBalance?: undefined;
    } | {
        totalUsers: number;
        totalBooks: number;
        totalAuthors: number;
        totalReaders: number;
        totalBalance: number;
        error?: undefined;
    } | {
        error?: undefined;
        totalUsers?: undefined;
        totalBooks?: undefined;
        totalAuthors?: undefined;
        totalReaders?: undefined;
        totalBalance?: undefined;
    }>;
    suspendUser(auth: string, body: {
        userId: string;
        suspend: boolean;
    }): Promise<{
        error: string;
        success?: undefined;
        user?: undefined;
    } | {
        success: boolean;
        user: {
            id: string;
            email: string;
            password: string | null;
            googleId: string | null;
            name: string;
            avatar: string | null;
            verified: boolean;
            country: string | null;
            role: import(".prisma/client").$Enums.Role;
            isVerified: boolean;
            isSuspended: boolean;
            suspendedAt: Date | null;
            suspendReason: string | null;
            createdAt: Date;
            updatedAt: Date;
            lastLoginAt: Date | null;
        };
        error?: undefined;
    }>;
    verifyAuthor(auth: string, body: {
        userId: string;
    }): Promise<{
        error: string;
        success?: undefined;
        user?: undefined;
    } | {
        success: boolean;
        user: {
            id: string;
            email: string;
            password: string | null;
            googleId: string | null;
            name: string;
            avatar: string | null;
            verified: boolean;
            country: string | null;
            role: import(".prisma/client").$Enums.Role;
            isVerified: boolean;
            isSuspended: boolean;
            suspendedAt: Date | null;
            suspendReason: string | null;
            createdAt: Date;
            updatedAt: Date;
            lastLoginAt: Date | null;
        };
        error?: undefined;
    }>;
    getBookById(id: string): Promise<({
        author: {
            name: string;
        };
        chapters: {
            number: number;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            title: string;
            bookId: string;
            content: string | null;
            fileUrl: string | null;
            pageCount: number;
            wordCount: number;
            isFree: boolean;
            isPublished: boolean;
        }[];
    } & {
        id: string;
        country: string | null;
        createdAt: Date;
        updatedAt: Date;
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
        authorId: string;
    }) | {
        error: any;
    }>;
    deleteBook(id: string, auth: string): Promise<{
        success: boolean;
        error?: undefined;
    } | {
        error: any;
        success?: undefined;
    }>;
    updateBookStatus(id: string, auth: string, body: {
        status: string;
    }): Promise<{
        id: string;
        country: string | null;
        createdAt: Date;
        updatedAt: Date;
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
        authorId: string;
    } | {
        error: any;
    }>;
}
