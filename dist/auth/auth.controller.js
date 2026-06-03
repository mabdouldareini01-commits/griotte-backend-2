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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const passport_1 = require("@nestjs/passport");
const swagger_1 = require("@nestjs/swagger");
const prisma_service_1 = require("../prisma/prisma.service");
const bcrypt = require("bcryptjs");
const jwt_1 = require("@nestjs/jwt");
const otp_service_1 = require("./otp.service");
let AuthController = class AuthController {
    constructor(prisma, jwt, otp) {
        this.prisma = prisma;
        this.jwt = jwt;
        this.otp = otp;
    }
    async register(body) {
        const existing = await this.prisma.user.findUnique({ where: { email: body.email } });
        if (existing)
            throw new Error('Email déjà utilisé');
        const hash = await bcrypt.hash(body.password, 12);
        const user = await this.prisma.user.create({
            data: {
                email: body.email,
                password: hash,
                name: body.name,
                role: body.role === 'AUTHOR' ? 'AUTHOR' : 'READER',
                verified: true,
                wallet: { create: { balance: 0 } },
            },
        });
        const token = this.jwt.sign({ sub: user.id, email: user.email, role: user.role });
        return { accessToken: token, refreshToken: token, role: user.role };
    }
    async login(body) {
        const user = await this.prisma.user.findUnique({ where: { email: body.email } });
        if (!user)
            throw new Error('Identifiants invalides');
        const valid = await bcrypt.compare(body.password, user.password || '');
        if (!valid)
            throw new Error('Identifiants invalides');
        const token = this.jwt.sign({ sub: user.id, email: user.email, role: user.role });
        return { accessToken: token, refreshToken: token, role: user.role };
    }
    async getMe(auth) {
        const token = auth?.replace('Bearer ', '');
        const payload = this.jwt.verify(token);
        const user = await this.prisma.user.findUnique({
            where: { id: payload.sub },
            include: { wallet: true },
        });
        return { name: user.name, email: user.email, role: user.role, balance: user.wallet?.balance || 0 };
    }
    async recharge(auth, body) {
        const token = auth?.replace('Bearer ', '');
        const payload = this.jwt.verify(token);
        const wallet = await this.prisma.wallet.findUnique({ where: { userId: payload.sub } });
        if (body.amount < 0 && (wallet?.balance || 0) + body.amount < 0) {
            return { error: 'Solde insuffisant', balance: wallet?.balance || 0 };
        }
        const updated = await this.prisma.wallet.update({
            where: { userId: payload.sub },
            data: { balance: { increment: body.amount } },
        });
        return { balance: updated.balance };
    }
    async getWalletBalance(auth) {
        const token = auth?.replace('Bearer ', '');
        const payload = this.jwt.verify(token);
        const wallet = await this.prisma.wallet.findUnique({
            where: { userId: payload.sub },
        });
        return { balance: wallet?.balance || 0 };
    }
    async publishBook(auth, body) {
        const token = auth?.replace('Bearer ', '');
        const payload = this.jwt.verify(token);
        const book = await this.prisma.book.create({
            data: {
                title: body.title,
                synopsis: body.synopsis,
                genre: body.genre,
                totalPages: body.totalPages,
                authorId: payload.sub,
                status: 'PUBLISHED',
                language: 'fr',
            },
        });
        return book;
    }
    async getBooks() {
        const books = await this.prisma.book.findMany({
            where: { status: 'PUBLISHED' },
            include: { author: { select: { name: true } } },
            orderBy: { createdAt: 'desc' },
        });
        return books;
    }
    async getMyBooks(req) {
        const books = await this.prisma.book.findMany({
            where: { authorId: req.user.userId },
            orderBy: { createdAt: 'desc' },
        });
        return books;
    }
    async getMyStats(req) {
        const books = await this.prisma.book.findMany({
            where: { authorId: req.user.userId },
        });
        const totalBooks = books.length;
        const totalPages = books.reduce((sum, b) => sum + (b.totalPages || 0), 0);
        return {
            totalBooks,
            totalPages,
            totalReaders: 0,
            totalRevenue: 0,
            books,
        };
    }
    async googleAuth(res) {
        const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.GOOGLE_CLIENT_ID}&redirect_uri=${process.env.GOOGLE_CALLBACK_URL}&response_type=code&scope=email profile`;
        return res.redirect(url);
    }
    async googleCallback(code, res) {
        try {
            const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code,
                    client_id: process.env.GOOGLE_CLIENT_ID,
                    client_secret: process.env.GOOGLE_CLIENT_SECRET,
                    redirect_uri: process.env.GOOGLE_CALLBACK_URL,
                    grant_type: 'authorization_code',
                }),
            });
            const tokenData = await tokenRes.json();
            const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: { Authorization: `Bearer ${tokenData.access_token}` },
            });
            const googleUser = await userRes.json();
            let user = await this.prisma.user.findUnique({ where: { email: googleUser.email } });
            if (!user) {
                user = await this.prisma.user.create({
                    data: {
                        email: googleUser.email,
                        name: googleUser.name,
                        password: '',
                        role: 'READER',
                        verified: true,
                        wallet: { create: { balance: 0 } },
                    },
                });
            }
            const token = this.jwt.sign({ sub: user.id, email: user.email, role: user.role });
            return res.redirect(`https://griotte-frontend-git-main-lawenignina.vercel.app/griotte-dashboard.html?token=${token}`);
        }
        catch (e) {
            return res.redirect(`https://griotte-frontend-git-main-lawenignina.vercel.app/griotte-landing.html?error=google`);
        }
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, common_1.Post)('register'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "register", null);
__decorate([
    (0, common_1.Post)('login'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "login", null);
__decorate([
    (0, common_1.Get)('me'),
    __param(0, (0, common_1.Headers)('authorization')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "getMe", null);
__decorate([
    (0, common_1.Post)('recharge'),
    __param(0, (0, common_1.Headers)('authorization')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "recharge", null);
__decorate([
    (0, common_1.Get)('wallets/balance'),
    __param(0, (0, common_1.Headers)('authorization')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "getWalletBalance", null);
__decorate([
    (0, common_1.Post)('publish-book'),
    __param(0, (0, common_1.Headers)('authorization')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "publishBook", null);
__decorate([
    (0, common_1.Get)('books-public'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "getBooks", null);
__decorate([
    (0, common_1.Get)('my-books'),
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt')),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "getMyBooks", null);
__decorate([
    (0, common_1.Get)('my-stats'),
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt')),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "getMyStats", null);
__decorate([
    (0, common_1.Get)('google'),
    __param(0, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "googleAuth", null);
__decorate([
    (0, common_1.Get)('google/callback'),
    __param(0, (0, common_1.Query)('code')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "googleCallback", null);
exports.AuthController = AuthController = __decorate([
    (0, swagger_1.ApiTags)('auth'),
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        jwt_1.JwtService,
        otp_service_1.OtpService])
], AuthController);
//# sourceMappingURL=auth.controller.js.map