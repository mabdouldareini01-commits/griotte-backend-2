// ══════════════════════════════════════════════════
// AUTH MODULE
// ══════════════════════════════════════════════════

// ─── auth.module.ts ───────────────────────────────
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { PrismaModule } from '../prisma/prisma.module';
import { WalletsModule } from '../wallets/wallets.module';

@Module({
  imports: [
    PrismaModule,
    WalletsModule,
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, LocalStrategy, GoogleStrategy],
  exports: [AuthService],
})
export class AuthModule {}

// ─── auth.service.ts ──────────────────────────────
import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { WalletsService } from '../wallets/wallets.service';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { RegisterDto } from './dto/register.dto';
import { Role } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private wallets: WalletsService,
    private config: ConfigService,
  ) {}

  // ─── Inscription
  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email déjà utilisé');

    const hashed = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashed,
        name: dto.name,
        country: dto.country,
        role: dto.role || Role.READER,
        wallet: { create: { balance: 0 } },
      },
    });

    // Bonus parrainage
    if (dto.referralCode) {
      await this.processReferral(user.id, dto.referralCode);
    }

    return this.generateTokens(user.id, user.email, user.role);
  }

  // ─── Connexion
  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.password) throw new UnauthorizedException('Identifiants invalides');
    if (user.isSuspended) throw new UnauthorizedException('Compte suspendu');

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw new UnauthorizedException('Identifiants invalides');

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return user;
  }

  // ─── Connexion Google OAuth
  async googleLogin(googleUser: any) {
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
    } else if (!user.googleId) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { googleId: googleUser.googleId },
      });
    }

    return this.generateTokens(user.id, user.email, user.role);
  }

  // ─── Refresh token
  async refresh(token: string) {
    const saved = await this.prisma.refreshToken.findUnique({ where: { token } });
    if (!saved || saved.expiresAt < new Date()) {
      throw new UnauthorizedException('Token expiré');
    }
    const user = await this.prisma.user.findUnique({ where: { id: saved.userId } });
    if (!user || user.isSuspended) throw new UnauthorizedException();

    await this.prisma.refreshToken.delete({ where: { token } });
    return this.generateTokens(user.id, user.email, user.role);
  }

  // ─── Logout
  async logout(token: string) {
    await this.prisma.refreshToken.deleteMany({ where: { token } });
  }

  // ─── Génération tokens
  private async generateTokens(userId: string, email: string, role: Role) {
    const payload = { sub: userId, email, role };
    const accessToken = this.jwt.sign(payload);

    const refreshToken = uuidv4();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 jours
    await this.prisma.refreshToken.create({
      data: { token: refreshToken, userId, expiresAt },
    });

    return { accessToken, refreshToken, expiresIn: 900 };
  }

  // ─── Traitement parrainage
  private async processReferral(newUserId: string, referralCode: string) {
    const referrer = await this.prisma.user.findFirst({
      where: { id: referralCode }, // Le code = l'ID de l'utilisateur
    });
    if (!referrer) return;

    await this.prisma.referral.create({
      data: {
        referrerId: referrer.id,
        referredId: newUserId,
        bonusAmount: 200,
      },
    });

    // Créditer le parrain
    await this.wallets.credit(referrer.id, 200, 'REFERRAL_BONUS', 'Bonus parrainage');
  }
}

// ─── auth.controller.ts ───────────────────────────
import {
  Controller, Post, Body, Get, UseGuards,
  Req, HttpCode, HttpStatus
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { GoogleAuthGuard } from './guards/google-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Inscription lecteur ou auteur' })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(LocalAuthGuard)
  @ApiOperation({ summary: 'Connexion email/mot de passe' })
  login(@Req() req: any, @Body() _dto: LoginDto) {
    return this.auth.generateTokens(req.user.id, req.user.email, req.user.role);
  }

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Connexion via Google OAuth2' })
  googleLogin() {}

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  googleCallback(@Req() req: any) {
    return this.auth.googleLogin(req.user);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rafraîchir le token JWT' })
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  logout(@Body() dto: RefreshDto) {
    return this.auth.logout(dto.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Profil de l'utilisateur connecté' })
  me(@Req() req: any) {
    return req.user;
  }
}

// ─── dto/register.dto.ts ──────────────────────────
import { IsEmail, IsString, MinLength, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class RegisterDto {
  @ApiProperty({ example: 'ama.kouyate@gmail.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'MotDePasse123!' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: 'Ama Kouyaté' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'ML', required: false })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiProperty({ enum: Role, default: Role.READER, required: false })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiProperty({ required: false, description: 'Code de parrainage' })
  @IsOptional()
  @IsString()
  referralCode?: string;
}

export class LoginDto {
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @IsString() password: string;
}

export class RefreshDto {
  @ApiProperty() @IsString() refreshToken: string;
}
