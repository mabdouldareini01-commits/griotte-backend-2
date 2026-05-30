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
exports.RefreshDto = exports.LoginDto = exports.RegisterDto = exports.AuthController = exports.AuthService = exports.AuthModule = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const passport_1 = require("@nestjs/passport");
const config_1 = require("@nestjs/config");
const auth_controller_1 = require("./auth.controller");
Object.defineProperty(exports, "AuthController", { enumerable: true, get: function () { return auth_controller_1.AuthController; } });
const auth_service_1 = require("./auth.service");
Object.defineProperty(exports, "AuthService", { enumerable: true, get: function () { return auth_service_1.AuthService; } });
const jwt_strategy_1 = require("./strategies/jwt.strategy");
const local_strategy_1 = require("./strategies/local.strategy");
const google_strategy_1 = require("./strategies/google.strategy");
const prisma_module_1 = require("../prisma/prisma.module");
const wallets_module_1 = require("../wallets/wallets.module");
let AuthModule = class AuthModule {
};
exports.AuthModule = AuthModule;
exports.AuthModule = AuthModule = __decorate([
    (0, common_1.Module)({
        imports: [
            prisma_module_1.PrismaModule,
            wallets_module_1.WalletsModule,
            passport_1.PassportModule,
            jwt_1.JwtModule.registerAsync({
                inject: [config_1.ConfigService],
                useFactory: (config) => ({
                    secret: config.get('JWT_SECRET'),
                    signOptions: { expiresIn: '15m' },
                }),
            }),
        ],
        controllers: [auth_controller_1.AuthController],
        providers: [auth_service_1.AuthService, jwt_strategy_1.JwtStrategy, local_strategy_1.LocalStrategy, google_strategy_1.GoogleStrategy],
        exports: [auth_service_1.AuthService],
    })
], AuthModule);
const common_2 = require("@nestjs/common");
const jwt_2 = require("@nestjs/jwt");
const prisma_service_1 = require("../prisma/prisma.service");
const wallets_service_1 = require("../wallets/wallets.service");
const bcrypt = require("bcryptjs");
const register_dto_1 = require("./dto/register.dto");
const client_1 = require("@prisma/client");
const uuid_1 = require("uuid");
let AuthService = class AuthService {
    constructor(prisma, jwt, wallets, config) {
        this.prisma = prisma;
        this.jwt = jwt;
        this.wallets = wallets;
        this.config = config;
    }
    async register(dto) {
        const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
        if (existing)
            throw new common_2.ConflictException('Email déjà utilisé');
        const hashed = await bcrypt.hash(dto.password, 12);
        const user = await this.prisma.user.create({
            data: {
                email: dto.email,
                password: hashed,
                name: dto.name,
                country: dto.country,
                role: dto.role || client_1.Role.READER,
                wallet: { create: { balance: 0 } },
            },
        });
        if (dto.referralCode) {
            await this.processReferral(user.id, dto.referralCode);
        }
        return this.generateTokens(user.id, user.email, user.role);
    }
    async validateUser(email, password) {
        const user = await this.prisma.user.findUnique({ where: { email } });
        if (!user || !user.password)
            throw new common_2.UnauthorizedException('Identifiants invalides');
        if (user.isSuspended)
            throw new common_2.UnauthorizedException('Compte suspendu');
        const valid = await bcrypt.compare(password, user.password);
        if (!valid)
            throw new common_2.UnauthorizedException('Identifiants invalides');
        await this.prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
        });
        return user;
    }
    async googleLogin(googleUser) {
        let user = await this.prisma.user.findFirst({
            where: { OR: [{ googleId: googleUser.googleId }, { email: googleUser.email }] },
        });
        if (!user) {
            user = await this.prisma.user.create({
                data: {
                    email: googleUser.email,
                    googleId: googleUser.googleId,
                    name: googleUser.name,
                    avatar: googleUser.avatar,
                    isVerified: true,
                    wallet: { create: { balance: 0 } },
                },
            });
        }
        else if (!user.googleId) {
            user = await this.prisma.user.update({
                where: { id: user.id },
                data: { googleId: googleUser.googleId },
            });
        }
        return this.generateTokens(user.id, user.email, user.role);
    }
    async refresh(token) {
        const saved = await this.prisma.refreshToken.findUnique({ where: { token } });
        if (!saved || saved.expiresAt < new Date()) {
            throw new common_2.UnauthorizedException('Token expiré');
        }
        const user = await this.prisma.user.findUnique({ where: { id: saved.userId } });
        if (!user || user.isSuspended)
            throw new common_2.UnauthorizedException();
        await this.prisma.refreshToken.delete({ where: { token } });
        return this.generateTokens(user.id, user.email, user.role);
    }
    async logout(token) {
        await this.prisma.refreshToken.deleteMany({ where: { token } });
    }
    async generateTokens(userId, email, role) {
        const payload = { sub: userId, email, role };
        const accessToken = this.jwt.sign(payload);
        const refreshToken = (0, uuid_1.v4)();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await this.prisma.refreshToken.create({
            data: { token: refreshToken, userId, expiresAt },
        });
        return { accessToken, refreshToken, expiresIn: 900 };
    }
    async processReferral(newUserId, referralCode) {
        const referrer = await this.prisma.user.findFirst({
            where: { id: referralCode },
        });
        if (!referrer)
            return;
        await this.prisma.referral.create({
            data: {
                referrerId: referrer.id,
                referredId: newUserId,
                bonusAmount: 200,
            },
        });
        await this.wallets.credit(referrer.id, 200, 'REFERRAL_BONUS', 'Bonus parrainage');
    }
};
exports.AuthService = AuthService;
exports.AuthService = auth_service_1.AuthService = __decorate([
    (0, common_2.Injectable)(),
    __metadata("design:paramtypes", [typeof (_a = typeof prisma_service_1.PrismaService !== "undefined" && prisma_service_1.PrismaService) === "function" ? _a : Object, jwt_2.JwtService,
        wallets_service_1.WalletsService,
        config_1.ConfigService])
], auth_service_1.AuthService);
const common_3 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const login_dto_1 = require("./dto/login.dto");
const refresh_dto_1 = require("./dto/refresh.dto");
const jwt_auth_guard_1 = require("./guards/jwt-auth.guard");
const local_auth_guard_1 = require("./guards/local-auth.guard");
const google_auth_guard_1 = require("./guards/google-auth.guard");
let AuthController = class AuthController {
    constructor(auth) {
        this.auth = auth;
    }
    register(dto) {
        return this.auth.register(dto);
    }
    login(req, _dto) {
        return this.auth.generateTokens(req.user.id, req.user.email, req.user.role);
    }
    googleLogin() { }
    googleCallback(req) {
        return this.auth.googleLogin(req.user);
    }
    refresh(dto) {
        return this.auth.refresh(dto.refreshToken);
    }
    logout(dto) {
        return this.auth.logout(dto.refreshToken);
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, common_3.Post)('register'),
    (0, swagger_1.ApiOperation)({ summary: 'Inscription lecteur ou auteur' }),
    __param(0, (0, common_3.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_c = typeof register_dto_1.RegisterDto !== "undefined" && register_dto_1.RegisterDto) === "function" ? _c : Object]),
    __metadata("design:returntype", void 0)
], auth_controller_1.AuthController.prototype, "register", null);
__decorate([
    (0, common_3.Post)('login'),
    (0, common_3.HttpCode)(common_3.HttpStatus.OK),
    (0, common_3.UseGuards)(local_auth_guard_1.LocalAuthGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Connexion email/mot de passe' }),
    __param(0, (0, common_3.Req)()),
    __param(1, (0, common_3.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, typeof (_d = typeof login_dto_1.LoginDto !== "undefined" && login_dto_1.LoginDto) === "function" ? _d : Object]),
    __metadata("design:returntype", void 0)
], auth_controller_1.AuthController.prototype, "login", null);
__decorate([
    (0, common_3.Get)('google'),
    (0, common_3.UseGuards)(google_auth_guard_1.GoogleAuthGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Connexion via Google OAuth2' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], auth_controller_1.AuthController.prototype, "googleLogin", null);
__decorate([
    (0, common_3.Get)('google/callback'),
    (0, common_3.UseGuards)(google_auth_guard_1.GoogleAuthGuard),
    __param(0, (0, common_3.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], auth_controller_1.AuthController.prototype, "googleCallback", null);
__decorate([
    (0, common_3.Post)('refresh'),
    (0, common_3.HttpCode)(common_3.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Rafraîchir le token JWT' }),
    __param(0, (0, common_3.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_e = typeof refresh_dto_1.RefreshDto !== "undefined" && refresh_dto_1.RefreshDto) === "function" ? _e : Object]),
    __metadata("design:returntype", void 0)
], auth_controller_1.AuthController.prototype, "refresh", null);
__decorate([
    (0, common_3.Post)('logout'),
    (0, common_3.HttpCode)(common_3.HttpStatus.NO_CONTENT),
    (0, common_3.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_3.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_f = typeof refresh_dto_1.RefreshDto !== "undefined" && refresh_dto_1.RefreshDto) === "function" ? _f : Object]),
    __metadata("design:returntype", void 0)
], auth_controller_1.AuthController.prototype, "logout", null);
__decorate([
    (0, common_3.Get)('me'),
    (0, common_3.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Profil de l', utilisateur, connecté, ' }): me(, req, any) }, {
        return: req.user
    }),
    __metadata("design:type", Object)
], auth_controller_1.AuthController.prototype, "", void 0);
exports.AuthController = auth_controller_1.AuthController = __decorate([
    (0, swagger_1.ApiTags)('auth'),
    (0, common_3.Controller)('auth'),
    __metadata("design:paramtypes", [typeof (_b = typeof auth_service_1.AuthService !== "undefined" && auth_service_1.AuthService) === "function" ? _b : Object])
], auth_controller_1.AuthController);
const class_validator_1 = require("class-validator");
const swagger_2 = require("@nestjs/swagger");
class RegisterDto {
}
exports.RegisterDto = RegisterDto;
__decorate([
    (0, swagger_2.ApiProperty)({ example: 'ama.kouyate@gmail.com' }),
    (0, class_validator_1.IsEmail)(),
    __metadata("design:type", String)
], register_dto_1.RegisterDto.prototype, "email", void 0);
__decorate([
    (0, swagger_2.ApiProperty)({ example: 'MotDePasse123!' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(8),
    __metadata("design:type", String)
], register_dto_1.RegisterDto.prototype, "password", void 0);
__decorate([
    (0, swagger_2.ApiProperty)({ example: 'Ama Kouyaté' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], register_dto_1.RegisterDto.prototype, "name", void 0);
__decorate([
    (0, swagger_2.ApiProperty)({ example: 'ML', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], register_dto_1.RegisterDto.prototype, "country", void 0);
__decorate([
    (0, swagger_2.ApiProperty)({ enum: client_1.Role, default: client_1.Role.READER, required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(client_1.Role),
    __metadata("design:type", String)
], register_dto_1.RegisterDto.prototype, "role", void 0);
__decorate([
    (0, swagger_2.ApiProperty)({ required: false, description: 'Code de parrainage' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], register_dto_1.RegisterDto.prototype, "referralCode", void 0);
class LoginDto {
}
exports.LoginDto = LoginDto;
__decorate([
    (0, swagger_2.ApiProperty)(),
    (0, class_validator_1.IsEmail)(),
    __metadata("design:type", String)
], login_dto_1.LoginDto.prototype, "email", void 0);
__decorate([
    (0, swagger_2.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], login_dto_1.LoginDto.prototype, "password", void 0);
class RefreshDto {
}
exports.RefreshDto = RefreshDto;
__decorate([
    (0, swagger_2.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], refresh_dto_1.RefreshDto.prototype, "refreshToken", void 0);
//# sourceMappingURL=auth.module.js.map