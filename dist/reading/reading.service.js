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
var _a, _b, _c, _d;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EndSessionDto = exports.StartSessionDto = exports.ReadingController = exports.ReadingService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const notifications_service_1 = require("../notifications/notifications.service");
const start_session_dto_1 = require("./dto/start-session.dto");
const end_session_dto_1 = require("./dto/end-session.dto");
const PRICE_PER_PAGE = 10;
const AUTHOR_SHARE = 0.60;
const PLATFORM_SHARE = 0.40;
let ReadingService = class ReadingService {
    constructor(prisma, notifications) {
        this.prisma = prisma;
        this.notifications = notifications;
    }
    async startSession(userId, dto) {
        const { bookId, chapterId, startPage } = dto;
        const book = await this.prisma.book.findUnique({
            where: { id: bookId },
            include: { author: true },
        });
        if (!book)
            throw new common_1.NotFoundException('Roman introuvable');
        const chapter = await this.prisma.chapter.findUnique({
            where: { id: chapterId },
        });
        if (!chapter)
            throw new common_1.NotFoundException('Chapitre introuvable');
        if (!chapter.isFree) {
            const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
            if (!wallet || wallet.balance < PRICE_PER_PAGE) {
                throw new common_1.BadRequestException('Solde insuffisant — rechargez votre portefeuille');
            }
        }
        const session = await this.prisma.readingSession.create({
            data: {
                userId,
                bookId,
                chapterId,
                startPage: startPage || 1,
                endPage: startPage || 1,
                pagesRead: 0,
                amountDebit: 0,
                amountAuthor: 0,
                amountPlatform: 0,
                startedAt: new Date(),
            },
        });
        return { sessionId: session.id, pricePerPage: PRICE_PER_PAGE };
    }
    async endSession(userId, sessionId, dto) {
        const session = await this.prisma.readingSession.findUnique({
            where: { id: sessionId },
            include: { book: { include: { author: true } }, chapter: true },
        });
        if (!session)
            throw new common_1.NotFoundException('Session introuvable');
        if (session.userId !== userId)
            throw new common_1.ForbiddenException();
        if (session.endedAt)
            throw new common_1.BadRequestException('Session déjà terminée');
        const { endPage, duration } = dto;
        const pagesRead = Math.max(0, endPage - session.startPage);
        if (session.chapter?.isFree) {
            return this.prisma.readingSession.update({
                where: { id: sessionId },
                data: { endPage, pagesRead: 0, endedAt: new Date(), duration },
            });
        }
        if (pagesRead === 0) {
            return this.prisma.readingSession.update({
                where: { id: sessionId },
                data: { endPage, endedAt: new Date(), duration },
            });
        }
        const totalDebit = pagesRead * PRICE_PER_PAGE;
        const authorAmount = Math.floor(totalDebit * AUTHOR_SHARE);
        const platformAmount = totalDebit - authorAmount;
        const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
        if (!wallet || wallet.balance < totalDebit) {
            const affordablePages = Math.floor(wallet.balance / PRICE_PER_PAGE);
            if (affordablePages === 0) {
                throw new common_1.BadRequestException('Solde épuisé');
            }
            return this.endSession(userId, sessionId, { endPage: session.startPage + affordablePages, duration });
        }
        const [updatedSession] = await this.prisma.$transaction([
            this.prisma.readingSession.update({
                where: { id: sessionId },
                data: {
                    endPage,
                    pagesRead,
                    amountDebit: totalDebit,
                    amountAuthor: authorAmount,
                    amountPlatform: platformAmount,
                    endedAt: new Date(),
                    duration,
                },
            }),
            this.prisma.wallet.update({
                where: { userId },
                data: { balance: { decrement: totalDebit } },
            }),
            this.prisma.wallet.update({
                where: { userId: session.book.authorId },
                data: { balance: { increment: authorAmount } },
            }),
            this.prisma.transaction.create({
                data: {
                    userId,
                    type: 'PAGE_READ',
                    status: 'COMPLETED',
                    amount: -totalDebit,
                    balanceBefore: wallet.balance,
                    balanceAfter: wallet.balance - totalDebit,
                    description: `Lecture : "${session.book.title}" (${pagesRead} pages)`,
                    readingSessionId: sessionId,
                },
            }),
            this.prisma.transaction.create({
                data: {
                    userId: session.book.authorId,
                    type: 'AUTHOR_CREDIT',
                    status: 'COMPLETED',
                    amount: authorAmount,
                    balanceBefore: 0,
                    balanceAfter: 0,
                    description: `Pages lues sur "${session.book.title}" (${pagesRead} p.)`,
                },
            }),
            this.prisma.book.update({
                where: { id: session.bookId },
                data: {
                    totalReads: { increment: pagesRead },
                    totalRevenue: { increment: authorAmount },
                },
            }),
        ]);
        if (authorAmount >= 50) {
            await this.notifications.send(session.book.authorId, {
                title: `📖 ${pagesRead} pages lues`,
                body: `Vous avez gagné ${authorAmount} FCFA sur "${session.book.title}"`,
                type: 'PAGE_READ',
                data: { bookId: session.bookId, amount: authorAmount },
            });
        }
        return {
            session: updatedSession,
            billing: {
                pagesRead,
                totalDebit,
                authorAmount,
                platformAmount,
                pricePerPage: PRICE_PER_PAGE,
                authorShare: '60%',
                platformShare: '40%',
            },
        };
    }
    async userHistory(userId, page = 1, limit = 20) {
        const [data, total] = await Promise.all([
            this.prisma.readingSession.findMany({
                where: { userId },
                orderBy: { startedAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
                include: {
                    book: { select: { id: true, title: true, coverColor: true } },
                    chapter: { select: { id: true, number: true, title: true } },
                },
            }),
            this.prisma.readingSession.count({ where: { userId } }),
        ]);
        return { data, meta: { total, page, limit } };
    }
    async getProgress(userId, bookId) {
        const sessions = await this.prisma.readingSession.findMany({
            where: { userId, bookId },
            orderBy: { startedAt: 'desc' },
        });
        if (!sessions.length)
            return null;
        const lastSession = sessions[0];
        const totalPagesRead = sessions.reduce((sum, s) => sum + s.pagesRead, 0);
        const totalSpent = sessions.reduce((sum, s) => sum + s.amountDebit, 0);
        const book = await this.prisma.book.findUnique({
            where: { id: bookId },
            select: { totalPages: true },
        });
        return {
            currentPage: lastSession.endPage,
            totalPages: book?.totalPages,
            progressPercent: book?.totalPages
                ? Math.round((lastSession.endPage / book.totalPages) * 100)
                : 0,
            totalPagesRead,
            totalSpentFcfa: totalSpent,
            lastReadAt: lastSession.endedAt,
        };
    }
};
exports.ReadingService = ReadingService;
exports.ReadingService = reading_service_1.ReadingService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeof (_a = typeof prisma_service_1.PrismaService !== "undefined" && prisma_service_1.PrismaService) === "function" ? _a : Object, typeof (_b = typeof notifications_service_1.NotificationsService !== "undefined" && notifications_service_1.NotificationsService) === "function" ? _b : Object])
], reading_service_1.ReadingService);
const common_2 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const reading_service_1 = require("./reading.service");
Object.defineProperty(exports, "ReadingService", { enumerable: true, get: function () { return reading_service_1.ReadingService; } });
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
let ReadingController = class ReadingController {
    constructor(reading) {
        this.reading = reading;
    }
    start(req, dto) {
        return this.reading.startSession(req.user.id, dto);
    }
    end(req, id, dto) {
        return this.reading.endSession(req.user.id, id, dto);
    }
    history(req, page, limit) {
        return this.reading.userHistory(req.user.id, page, limit);
    }
    progress(req, bookId) {
        return this.reading.getProgress(req.user.id, bookId);
    }
};
exports.ReadingController = ReadingController;
__decorate([
    (0, common_2.Post)('start'),
    (0, swagger_1.ApiOperation)({ summary: 'Démarrer une session de lecture' }),
    __param(0, (0, common_2.Req)()),
    __param(1, (0, common_2.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, typeof (_c = typeof start_session_dto_1.StartSessionDto !== "undefined" && start_session_dto_1.StartSessionDto) === "function" ? _c : Object]),
    __metadata("design:returntype", void 0)
], ReadingController.prototype, "start", null);
__decorate([
    (0, common_2.Post)(':sessionId/end'),
    (0, swagger_1.ApiOperation)({ summary: 'Terminer une session — déclenche la facturation' }),
    __param(0, (0, common_2.Req)()),
    __param(1, (0, common_2.Param)('sessionId')),
    __param(2, (0, common_2.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, typeof (_d = typeof end_session_dto_1.EndSessionDto !== "undefined" && end_session_dto_1.EndSessionDto) === "function" ? _d : Object]),
    __metadata("design:returntype", void 0)
], ReadingController.prototype, "end", null);
__decorate([
    (0, common_2.Get)('history'),
    (0, swagger_1.ApiOperation)({ summary: 'Historique de lecture' }),
    __param(0, (0, common_2.Req)()),
    __param(1, (0, common_2.Query)('page')),
    __param(2, (0, common_2.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, Number]),
    __metadata("design:returntype", void 0)
], ReadingController.prototype, "history", null);
__decorate([
    (0, common_2.Get)('progress/:bookId'),
    (0, swagger_1.ApiOperation)({ summary: 'Progression dans un roman' }),
    __param(0, (0, common_2.Req)()),
    __param(1, (0, common_2.Param)('bookId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ReadingController.prototype, "progress", null);
exports.ReadingController = ReadingController = __decorate([
    (0, swagger_1.ApiTags)('reading'),
    (0, common_2.Controller)('reading'),
    (0, common_2.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __metadata("design:paramtypes", [reading_service_1.ReadingService])
], ReadingController);
const class_validator_1 = require("class-validator");
const swagger_2 = require("@nestjs/swagger");
class StartSessionDto {
}
exports.StartSessionDto = StartSessionDto;
__decorate([
    (0, swagger_2.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], start_session_dto_1.StartSessionDto.prototype, "bookId", void 0);
__decorate([
    (0, swagger_2.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], start_session_dto_1.StartSessionDto.prototype, "chapterId", void 0);
__decorate([
    (0, swagger_2.ApiProperty)({ required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], start_session_dto_1.StartSessionDto.prototype, "startPage", void 0);
class EndSessionDto {
}
exports.EndSessionDto = EndSessionDto;
__decorate([
    (0, swagger_2.ApiProperty)(),
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], end_session_dto_1.EndSessionDto.prototype, "endPage", void 0);
__decorate([
    (0, swagger_2.ApiProperty)({ required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], end_session_dto_1.EndSessionDto.prototype, "duration", void 0);
//# sourceMappingURL=reading.service.js.map