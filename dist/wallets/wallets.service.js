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
var _a, _b, _c, _d, _e;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationsService = exports.ChaptersService = exports.WithdrawalsService = exports.WalletsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const config_1 = require("@nestjs/config");
const axios_1 = require("axios");
let WalletsService = class WalletsService {
    constructor(prisma, config) {
        this.prisma = prisma;
        this.config = config;
    }
    async getBalance(userId) {
        const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
        return {
            balance: wallet?.balance || 0,
            pages: Math.floor((wallet?.balance || 0) / 10),
        };
    }
    async initiateRecharge(userId, amount, method) {
        if (amount < 100)
            throw new common_1.BadRequestException('Montant minimum : 100 FCFA');
        const ref = `GRIOTTE-${userId.slice(0, 8)}-${Date.now()}`;
        const response = await axios_1.default.post('https://api-checkout.fedapay.com/v2/payment', {
            apiKey: this.config.get('FEDAPAY_API_KEY'),
            publicKey: this.config.get('FEDAPAY_SITE_ID'),
            transaction_id: ref,
            amount,
            currency: 'XOF',
            description: `Recharge GRIOTTE — ${amount} FCFA`,
            return_url: `${this.config.get('FRONTEND_URL')}/wallet/success`,
            callback_url: `${this.config.get('API_URL')}/api/v1/wallets/webhook/fedapay`,
            customer_id: userId,
        });
        await this.prisma.transaction.create({
            data: {
                userId,
                type: 'RECHARGE',
                status: 'PENDING',
                amount,
                balanceBefore: 0,
                balanceAfter: 0,
                description: `Recharge ${amount} FCFA`,
                reference: ref,
                paymentMethod: method === 'mobile_money' ? 'MOBILE_MONEY' : 'CARD',
            },
        });
        return {
            paymentUrl: response.data?.data?.payment_url,
            reference: ref,
        };
    }
    async handleFedaPayWebhook(payload) {
        const signature = require('crypto')
            .createHmac('sha256', this.config.get('FEDAPAY_SECRET_KEY'))
            .update(JSON.stringify(payload))
            .digest('hex');
        if (payload.status !== 'approved')
            return { ignored: true };
        const reference = payload.custom_metadata?.reference;
        return this.confirmPayment(reference);
    }
    async confirmPayment(reference) {
        const transaction = await this.prisma.transaction.findUnique({
            where: { reference },
        });
        if (!transaction || transaction.status === 'COMPLETED')
            return;
        const wallet = await this.prisma.wallet.findUnique({
            where: { userId: transaction.userId },
        });
        const balanceBefore = wallet.balance;
        await this.prisma.$transaction([
            this.prisma.wallet.update({
                where: { userId: transaction.userId },
                data: { balance: { increment: transaction.amount } },
            }),
            this.prisma.transaction.update({
                where: { reference },
                data: {
                    status: 'COMPLETED',
                    balanceBefore,
                    balanceAfter: balanceBefore + transaction.amount,
                },
            }),
        ]);
        return { credited: transaction.amount };
    }
    async credit(userId, amount, type, description) {
        const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
        const balanceBefore = wallet.balance;
        await this.prisma.$transaction([
            this.prisma.wallet.update({
                where: { userId },
                data: { balance: { increment: amount } },
            }),
            this.prisma.transaction.create({
                data: {
                    userId,
                    type: type,
                    status: 'COMPLETED',
                    amount,
                    balanceBefore,
                    balanceAfter: balanceBefore + amount,
                    description,
                },
            }),
        ]);
    }
    async history(userId, page = 1, limit = 20) {
        const [data, total] = await Promise.all([
            this.prisma.transaction.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.transaction.count({ where: { userId } }),
        ]);
        return { data, meta: { total, page, limit } };
    }
};
exports.WalletsService = WalletsService;
exports.WalletsService = WalletsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeof (_a = typeof prisma_service_1.PrismaService !== "undefined" && prisma_service_1.PrismaService) === "function" ? _a : Object, config_1.ConfigService])
], WalletsService);
const common_2 = require("@nestjs/common");
const client_1 = require("@prisma/client");
let WithdrawalsService = class WithdrawalsService {
    constructor(prisma, notifications) {
        this.prisma = prisma;
        this.notifications = notifications;
    }
    async create(userId, dto) {
        const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
        if (!wallet || wallet.balance < dto.amount) {
            throw new common_1.BadRequestException('Solde insuffisant');
        }
        if (dto.amount < 500) {
            throw new common_1.BadRequestException('Retrait minimum : 500 FCFA');
        }
        await this.prisma.wallet.update({
            where: { userId },
            data: { balance: { decrement: dto.amount } },
        });
        const withdrawal = await this.prisma.withdrawal.create({
            data: {
                userId,
                amount: dto.amount,
                method: dto.method,
                accountNumber: dto.accountNumber,
                accountName: dto.accountName,
                status: client_1.WithdrawalStatus.PENDING,
            },
        });
        await this.notifications.send(userId, {
            title: '💸 Demande de retrait reçue',
            body: `Votre demande de ${dto.amount} FCFA est en cours de traitement (24–48h).`,
            type: 'WITHDRAWAL_PENDING',
        });
        return withdrawal;
    }
    async process(id, reference, adminNote) {
        const withdrawal = await this.prisma.withdrawal.findUnique({
            where: { id },
            include: { user: true },
        });
        if (!withdrawal)
            throw new common_2.NotFoundException();
        const updated = await this.prisma.withdrawal.update({
            where: { id },
            data: {
                status: client_1.WithdrawalStatus.COMPLETED,
                processedAt: new Date(),
                reference,
                adminNote,
            },
        });
        await this.notifications.send(withdrawal.userId, {
            title: '✅ Retrait effectué !',
            body: `${withdrawal.amount} FCFA transférés sur votre ${withdrawal.method}.`,
            type: 'WITHDRAWAL_COMPLETED',
        });
        return updated;
    }
    async fail(id, reason) {
        const withdrawal = await this.prisma.withdrawal.findUnique({ where: { id } });
        if (!withdrawal)
            throw new common_2.NotFoundException();
        await this.prisma.$transaction([
            this.prisma.wallet.update({
                where: { userId: withdrawal.userId },
                data: { balance: { increment: withdrawal.amount } },
            }),
            this.prisma.withdrawal.update({
                where: { id },
                data: { status: client_1.WithdrawalStatus.FAILED, adminNote: reason },
            }),
        ]);
        await this.notifications.send(withdrawal.userId, {
            title: '❌ Retrait échoué',
            body: `Votre retrait de ${withdrawal.amount} FCFA a échoué. Raison : ${reason}. Votre solde a été recrédité.`,
            type: 'WITHDRAWAL_FAILED',
        });
    }
    async findByUser(userId) {
        return this.prisma.withdrawal.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
        });
    }
    async findAll(status) {
        return this.prisma.withdrawal.findMany({
            where: status ? { status } : {},
            orderBy: { createdAt: 'desc' },
            include: { user: { select: { id: true, name: true, email: true } } },
        });
    }
};
exports.WithdrawalsService = WithdrawalsService;
exports.WithdrawalsService = WithdrawalsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeof (_b = typeof prisma_service_1.PrismaService !== "undefined" && prisma_service_1.PrismaService) === "function" ? _b : Object, NotificationsService])
], WithdrawalsService);
const common_3 = require("@nestjs/common");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
let ChaptersService = class ChaptersService {
    constructor(prisma, s3) {
        this.prisma = prisma;
        this.s3 = s3;
    }
    async create(bookId, authorId, file, dto) {
        const book = await this.prisma.book.findUnique({ where: { id: bookId } });
        if (!book)
            throw new common_2.NotFoundException('Roman introuvable');
        if (book.authorId !== authorId)
            throw new common_3.ForbiddenException();
        const fileUrl = await this.s3.upload(file, `books/${bookId}/chapters/${dto.number}`);
        const { content, pageCount, wordCount } = await this.extractContent(file);
        const chapter = await this.prisma.chapter.create({
            data: {
                bookId,
                number: dto.number,
                title: dto.title,
                content,
                fileUrl,
                pageCount,
                wordCount,
                isFree: dto.isFree || false,
                isPublished: true,
            },
        });
        await this.prisma.book.update({
            where: { id: bookId },
            data: { totalPages: { increment: pageCount } },
        });
        return chapter;
    }
    async getContent(chapterId, userId) {
        const chapter = await this.prisma.chapter.findUnique({
            where: { id: chapterId },
            include: { book: true },
        });
        if (!chapter)
            throw new common_2.NotFoundException();
        if (chapter.book.authorId === userId)
            return chapter;
        if (chapter.isFree)
            return chapter;
        const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
        if (!wallet || wallet.balance < 10) {
            throw new common_3.ForbiddenException('Solde insuffisant pour accéder à ce chapitre');
        }
        return chapter;
    }
    async extractContent(file) {
        const mime = file.mimetype;
        let content = '';
        let wordCount = 0;
        if (mime === 'application/pdf') {
            const data = await pdfParse(file.buffer);
            content = data.text;
        }
        else if (mime.includes('word') || mime.includes('docx')) {
            const result = await mammoth.extractRawText({ buffer: file.buffer });
            content = result.value;
        }
        else {
            content = file.buffer.toString('utf-8');
        }
        wordCount = content.split(/\s+/).filter(Boolean).length;
        const pageCount = Math.max(1, Math.round(wordCount / 250));
        return { content, pageCount, wordCount };
    }
};
exports.ChaptersService = ChaptersService;
exports.ChaptersService = ChaptersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeof (_c = typeof prisma_service_1.PrismaService !== "undefined" && prisma_service_1.PrismaService) === "function" ? _c : Object, typeof (_d = typeof S3Service !== "undefined" && S3Service) === "function" ? _d : Object])
], ChaptersService);
let NotificationsService = class NotificationsService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async send(userId, data) {
        return this.prisma.notification.create({
            data: {
                userId,
                title: data.title,
                body: data.body,
                type: data.type,
                data: data.data,
            },
        });
    }
    async findAll(userId) {
        return this.prisma.notification.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 50,
        });
    }
    async markRead(userId, id) {
        return this.prisma.notification.updateMany({
            where: { id, userId },
            data: { isRead: true },
        });
    }
    async markAllRead(userId) {
        return this.prisma.notification.updateMany({
            where: { userId, isRead: false },
            data: { isRead: true },
        });
    }
    async unreadCount(userId) {
        return this.prisma.notification.count({ where: { userId, isRead: false } });
    }
};
exports.NotificationsService = NotificationsService;
exports.NotificationsService = NotificationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeof (_e = typeof prisma_service_1.PrismaService !== "undefined" && prisma_service_1.PrismaService) === "function" ? _e : Object])
], NotificationsService);
//# sourceMappingURL=wallets.service.js.map