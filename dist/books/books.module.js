"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var _a, _b, _c, _d, _e, _f;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookQueryDto = exports.UpdateBookDto = exports.CreateBookDto = exports.BooksController = exports.BooksService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const notifications_service_1 = require("../notifications/notifications.service");
const client_1 = require("@prisma/client");
const create_book_dto_1 = require("./dto/create-book.dto");
const update_book_dto_1 = require("./dto/update-book.dto");
const book_query_dto_1 = require("./dto/book-query.dto");
let BooksService = class BooksService {
    constructor(prisma, notifications) {
        this.prisma = prisma;
        this.notifications = notifications;
    }
    async create(authorId, dto) {
        return this.prisma.book.create({
            data: {
                authorId,
                title: dto.title,
                subtitle: dto.subtitle,
                synopsis: dto.synopsis,
                coverColor: dto.coverColor || 'cs1',
                genre: dto.genre,
                subGenre: dto.subGenre,
                country: dto.country,
                language: dto.language || 'fr',
                tags: dto.tags || [],
                targetAudience: dto.targetAudience || 'ALL',
                sensitiveContent: dto.sensitiveContent || 'NONE',
                authorNote: dto.authorNote,
                isFreeFirst: dto.isFreeFirst ?? true,
                yearWritten: dto.yearWritten,
                status: client_1.BookStatus.DRAFT,
            },
            include: { author: { select: { id: true, name: true, country: true } } },
        });
    }
    async findAll(query) {
        const { search, genre, country, language, minRating, maxPages, minPages, page = 1, limit = 24, sort = 'trending', } = query;
        const where = {
            status: client_1.BookStatus.PUBLISHED,
            isPublic: true,
        };
        if (search) {
            where.OR = [
                { title: { contains: search, mode: 'insensitive' } },
                { synopsis: { contains: search, mode: 'insensitive' } },
                { tags: { has: search } },
                { author: { name: { contains: search, mode: 'insensitive' } } },
            ];
        }
        if (genre)
            where.genre = { contains: genre, mode: 'insensitive' };
        if (country)
            where.country = country;
        if (language)
            where.language = language;
        if (minRating)
            where.averageRating = { gte: minRating };
        if (maxPages)
            where.totalPages = { ...where.totalPages, lte: maxPages };
        if (minPages)
            where.totalPages = { ...where.totalPages, gte: minPages };
        const orderBy = {
            trending: { totalReads: 'desc' },
            newest: { publishedAt: 'desc' },
            rating: { averageRating: 'desc' },
            priceAsc: { totalPages: 'asc' },
            priceDesc: { totalPages: 'desc' },
        }[sort] || { totalReads: 'desc' };
        const [data, total] = await Promise.all([
            this.prisma.book.findMany({
                where,
                orderBy,
                skip: (page - 1) * limit,
                take: limit,
                include: {
                    author: { select: { id: true, name: true, country: true, avatar: true } },
                    _count: { select: { reviews: true } },
                },
            }),
            this.prisma.book.count({ where }),
        ]);
        return {
            data,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        };
    }
    async findOne(id, userId) {
        const book = await this.prisma.book.findUnique({
            where: { id },
            include: {
                author: { select: { id: true, name: true, country: true, avatar: true, bio: true } },
                chapters: {
                    where: { isPublished: true },
                    orderBy: { number: 'asc' },
                    select: { id: true, number: true, title: true, pageCount: true, isFree: true },
                },
                reviews: {
                    take: 10,
                    orderBy: { createdAt: 'desc' },
                    include: { user: { select: { id: true, name: true, country: true, avatar: true } } },
                },
                _count: { select: { reviews: true, readingSessions: true } },
            },
        });
        if (!book)
            throw new common_1.NotFoundException('Roman introuvable');
        if (book.status !== client_1.BookStatus.PUBLISHED && book.authorId !== userId) {
            throw new common_1.ForbiddenException('Roman non publié');
        }
        let userBookmark = null;
        if (userId) {
            userBookmark = await this.prisma.bookmark.findUnique({
                where: { userId_bookId: { userId, bookId: id } },
            });
        }
        return { ...book, userBookmark };
    }
    async update(id, userId, role, dto) {
        const book = await this.prisma.book.findUnique({ where: { id } });
        if (!book)
            throw new common_1.NotFoundException();
        if (book.authorId !== userId && role !== client_1.Role.ADMIN)
            throw new common_1.ForbiddenException();
        if (book.status === client_1.BookStatus.PUBLISHED && role !== client_1.Role.ADMIN) {
            throw new common_1.ForbiddenException('Un roman publié ne peut être modifié que par un admin');
        }
        return this.prisma.book.update({
            where: { id },
            data: { ...dto, status: client_1.BookStatus.DRAFT },
        });
    }
    async submit(id, userId) {
        const book = await this.prisma.book.findUnique({
            where: { id },
            include: { chapters: true },
        });
        if (!book)
            throw new common_1.NotFoundException();
        if (book.authorId !== userId)
            throw new common_1.ForbiddenException();
        if (book.chapters.length === 0) {
            throw new common_1.BadRequestException('Ajoutez au moins un chapitre avant de soumettre');
        }
        return this.prisma.book.update({
            where: { id },
            data: { status: client_1.BookStatus.PENDING_REVIEW },
        });
    }
    async approve(id) {
        const book = await this.prisma.book.update({
            where: { id },
            data: { status: client_1.BookStatus.PUBLISHED, publishedAt: new Date() },
            include: { author: true },
        });
        await this.notifications.send(book.authorId, {
            title: '🎉 Roman publié !',
            body: `"${book.title}" est maintenant visible dans le catalogue GRIOTTE.`,
            type: 'BOOK_PUBLISHED',
        });
        return book;
    }
    async reject(id, note) {
        const book = await this.prisma.book.update({
            where: { id },
            data: { status: client_1.BookStatus.REJECTED, rejectionNote: note },
            include: { author: true },
        });
        await this.notifications.send(book.authorId, {
            title: '📝 Corrections demandées',
            body: `"${book.title}" nécessite des modifications : ${note}`,
            type: 'BOOK_REJECTED',
        });
        return book;
    }
    async findByAuthor(authorId) {
        return this.prisma.book.findMany({
            where: { authorId },
            orderBy: { createdAt: 'desc' },
            include: {
                _count: { select: { reviews: true, readingSessions: true } },
            },
        });
    }
    async authorStats(authorId) {
        const [totalRevenue, totalPages, totalReaders] = await Promise.all([
            this.prisma.transaction.aggregate({
                where: {
                    user: { id: authorId },
                    type: 'AUTHOR_CREDIT',
                },
                _sum: { amount: true },
            }),
            this.prisma.readingSession.aggregate({
                where: { book: { authorId } },
                _sum: { pagesRead: true },
            }),
            this.prisma.readingSession.groupBy({
                by: ['userId'],
                where: { book: { authorId } },
            }),
        ]);
        return {
            totalRevenueFcfa: totalRevenue._sum.amount || 0,
            totalPagesRead: totalPages._sum.pagesRead || 0,
            uniqueReaders: totalReaders.length,
        };
    }
};
exports.BooksService = BooksService;
exports.BooksService = books_service_1.BooksService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeof (_a = typeof prisma_service_1.PrismaService !== "undefined" && prisma_service_1.PrismaService) === "function" ? _a : Object, typeof (_b = typeof notifications_service_1.NotificationsService !== "undefined" && notifications_service_1.NotificationsService) === "function" ? _b : Object])
], books_service_1.BooksService);
const common_2 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const books_service_1 = require("./books.service");
Object.defineProperty(exports, "BooksService", { enumerable: true, get: function () { return books_service_1.BooksService; } });
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const optional_jwt_guard_1 = require("../auth/guards/optional-jwt.guard");
let BooksController = class BooksController {
    constructor(books) {
        this.books = books;
    }
    findAll(query) {
        return this.books.findAll(query);
    }
    mine(req) {
        return this.books.findByAuthor(req.user.id);
    }
    authorStats(req) {
        return this.books.authorStats(req.user.id);
    }
    findOne(id, req) {
        return this.books.findOne(id, req.user?.id);
    }
    create(req, dto) {
        return this.books.create(req.user.id, dto);
    }
    update(id, req, dto) {
        return this.books.update(id, req.user.id, req.user.role, dto);
    }
    submit(id, req) {
        return this.books.submit(id, req.user.id);
    }
    approve(id) {
        return this.books.approve(id);
    }
    reject(id, note) {
        return this.books.reject(id, note);
    }
};
exports.BooksController = BooksController;
__decorate([
    (0, common_2.Get)(),
    (0, common_2.UseGuards)(optional_jwt_guard_1.OptionalJwtGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Catalogue public avec filtres et recherche' }),
    __param(0, (0, common_2.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_d = typeof book_query_dto_1.BookQueryDto !== "undefined" && book_query_dto_1.BookQueryDto) === "function" ? _d : Object]),
    __metadata("design:returntype", void 0)
], BooksController.prototype, "findAll", null);
__decorate([
    (0, common_2.Get)('mine'),
    (0, common_2.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Romans de l\'auteur connecté' }),
    __param(0, (0, common_2.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], BooksController.prototype, "mine", null);
__decorate([
    (0, common_2.Get)('mine/stats'),
    (0, common_2.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_2.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], BooksController.prototype, "authorStats", null);
__decorate([
    (0, common_2.Get)(':id'),
    (0, common_2.UseGuards)(optional_jwt_guard_1.OptionalJwtGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Fiche détaillée d\'un roman' }),
    __param(0, (0, common_2.Param)('id')),
    __param(1, (0, common_2.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], BooksController.prototype, "findOne", null);
__decorate([
    (0, common_2.Post)(),
    (0, common_2.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.AUTHOR, client_1.Role.ADMIN),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Créer un nouveau roman (auteur)' }),
    __param(0, (0, common_2.Req)()),
    __param(1, (0, common_2.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, typeof (_e = typeof create_book_dto_1.CreateBookDto !== "undefined" && create_book_dto_1.CreateBookDto) === "function" ? _e : Object]),
    __metadata("design:returntype", void 0)
], BooksController.prototype, "create", null);
__decorate([
    (0, common_2.Put)(':id'),
    (0, common_2.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_2.Param)('id')),
    __param(1, (0, common_2.Req)()),
    __param(2, (0, common_2.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, typeof (_f = typeof update_book_dto_1.UpdateBookDto !== "undefined" && update_book_dto_1.UpdateBookDto) === "function" ? _f : Object]),
    __metadata("design:returntype", void 0)
], BooksController.prototype, "update", null);
__decorate([
    (0, common_2.Post)(':id/submit'),
    (0, common_2.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.AUTHOR),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_2.HttpCode)(common_2.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Soumettre le roman à la validation éditoriale' }),
    __param(0, (0, common_2.Param)('id')),
    __param(1, (0, common_2.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], BooksController.prototype, "submit", null);
__decorate([
    (0, common_2.Post)(':id/approve'),
    (0, common_2.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.ADMIN),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_2.HttpCode)(common_2.HttpStatus.OK),
    __param(0, (0, common_2.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], BooksController.prototype, "approve", null);
__decorate([
    (0, common_2.Post)(':id/reject'),
    (0, common_2.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.ADMIN),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_2.HttpCode)(common_2.HttpStatus.OK),
    __param(0, (0, common_2.Param)('id')),
    __param(1, (0, common_2.Body)('note')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], BooksController.prototype, "reject", null);
exports.BooksController = BooksController = __decorate([
    (0, swagger_1.ApiTags)('books'),
    (0, common_2.Controller)('books'),
    __metadata("design:paramtypes", [typeof (_c = typeof books_service_1.BooksService !== "undefined" && books_service_1.BooksService) === "function" ? _c : Object])
], BooksController);
const class_validator_1 = require("class-validator");
const swagger_2 = require("@nestjs/swagger");
class CreateBookDto {
}
exports.CreateBookDto = CreateBookDto;
__decorate([
    (0, swagger_2.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], create_book_dto_1.CreateBookDto.prototype, "title", void 0);
__decorate([
    (0, swagger_2.ApiProperty)({ required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], create_book_dto_1.CreateBookDto.prototype, "subtitle", void 0);
__decorate([
    (0, swagger_2.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], create_book_dto_1.CreateBookDto.prototype, "synopsis", void 0);
__decorate([
    (0, swagger_2.ApiProperty)({ required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], create_book_dto_1.CreateBookDto.prototype, "coverColor", void 0);
__decorate([
    (0, swagger_2.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], create_book_dto_1.CreateBookDto.prototype, "genre", void 0);
__decorate([
    (0, swagger_2.ApiProperty)({ required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], create_book_dto_1.CreateBookDto.prototype, "subGenre", void 0);
__decorate([
    (0, swagger_2.ApiProperty)({ required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], create_book_dto_1.CreateBookDto.prototype, "country", void 0);
__decorate([
    (0, swagger_2.ApiProperty)({ required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], create_book_dto_1.CreateBookDto.prototype, "language", void 0);
__decorate([
    (0, swagger_2.ApiProperty)({ type: [String], required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    __metadata("design:type", Array)
], create_book_dto_1.CreateBookDto.prototype, "tags", void 0);
__decorate([
    (0, swagger_2.ApiProperty)({ required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], create_book_dto_1.CreateBookDto.prototype, "targetAudience", void 0);
__decorate([
    (0, swagger_2.ApiProperty)({ required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], create_book_dto_1.CreateBookDto.prototype, "sensitiveContent", void 0);
__decorate([
    (0, swagger_2.ApiProperty)({ required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], create_book_dto_1.CreateBookDto.prototype, "authorNote", void 0);
__decorate([
    (0, swagger_2.ApiProperty)({ required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], create_book_dto_1.CreateBookDto.prototype, "isFreeFirst", void 0);
__decorate([
    (0, swagger_2.ApiProperty)({ required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], create_book_dto_1.CreateBookDto.prototype, "yearWritten", void 0);
class UpdateBookDto extends create_book_dto_1.CreateBookDto {
}
exports.UpdateBookDto = UpdateBookDto;
class BookQueryDto {
}
exports.BookQueryDto = BookQueryDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], book_query_dto_1.BookQueryDto.prototype, "search", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], book_query_dto_1.BookQueryDto.prototype, "genre", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], book_query_dto_1.BookQueryDto.prototype, "country", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], book_query_dto_1.BookQueryDto.prototype, "language", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], book_query_dto_1.BookQueryDto.prototype, "minRating", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], book_query_dto_1.BookQueryDto.prototype, "maxPages", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], book_query_dto_1.BookQueryDto.prototype, "minPages", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], book_query_dto_1.BookQueryDto.prototype, "page", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], book_query_dto_1.BookQueryDto.prototype, "limit", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], book_query_dto_1.BookQueryDto.prototype, "sort", void 0);
//# sourceMappingURL=books.module.js.map