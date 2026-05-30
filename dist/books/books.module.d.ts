import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Role } from '@prisma/client';
import { CreateBookDto } from './dto/create-book.dto';
import { UpdateBookDto } from './dto/update-book.dto';
import { BookQueryDto } from './dto/book-query.dto';
export declare class BooksService {
    private prisma;
    private notifications;
    constructor(prisma: PrismaService, notifications: NotificationsService);
    create(authorId: string, dto: CreateBookDto): Promise<any>;
    findAll(query: BookQueryDto): Promise<{
        data: any;
        meta: {
            total: any;
            page: BookQueryDto;
            limit: BookQueryDto;
            totalPages: number;
        };
    }>;
    findOne(id: string, userId?: string): Promise<any>;
    update(id: string, userId: string, role: Role, dto: UpdateBookDto): Promise<any>;
    submit(id: string, userId: string): Promise<any>;
    approve(id: string): Promise<any>;
    reject(id: string, note: string): Promise<any>;
    findByAuthor(authorId: string): Promise<any>;
    authorStats(authorId: string): Promise<{
        totalRevenueFcfa: any;
        totalPagesRead: any;
        uniqueReaders: any;
    }>;
}
import { BooksService } from './books.service';
export declare class BooksController {
    private books;
    constructor(books: BooksService);
    findAll(query: BookQueryDto): any;
    mine(req: any): any;
    authorStats(req: any): any;
    findOne(id: string, req: any): any;
    create(req: any, dto: CreateBookDto): any;
    update(id: string, req: any, dto: UpdateBookDto): any;
    submit(id: string, req: any): any;
    approve(id: string): any;
    reject(id: string, note: string): any;
}
export declare class CreateBookDto {
    title: string;
    subtitle?: string;
    synopsis: string;
    coverColor?: string;
    genre: string;
    subGenre?: string;
    country?: string;
    language?: string;
    tags?: string[];
    targetAudience?: string;
    sensitiveContent?: string;
    authorNote?: string;
    isFreeFirst?: boolean;
    yearWritten?: number;
}
export declare class UpdateBookDto extends CreateBookDto {
}
export declare class BookQueryDto {
    search?: string;
    genre?: string;
    country?: string;
    language?: string;
    minRating?: number;
    maxPages?: number;
    minPages?: number;
    page?: number;
    limit?: number;
    sort?: string;
}
