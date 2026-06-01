import { Controller, Post, Body, Get, Query, Res, Headers } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { OtpService } from './otp.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private otp: OtpService,
  ) {}

  @Post('register')
  async register(@Body() body: any) {
    const existing = await this.prisma.user.findUnique({ where: { email: body.email } });
    if (existing) return { message: 'Email déjà utilisé' };
    const hashed = await bcrypt.hash(body.password, 12);
    const user = await this.prisma.user.create({
      data: {
        email: body.email,
        password: hashed,
        name: body.name,
        role: body.role || 'READER',
        verified: false,
        wallet: { create: { balance: 0 } },
      },
    });
    const token = this.jwt.sign({ sub: user.id, email: user.email, role: user.role });
    return { accessToken: token, refreshToken: token, role: user.role };
  }

  @Post('verify-otp')
  async verifyOtp(@Body() body: any) {
    const valid = await this.otp.verifyOtp(body.email, body.code);
    if (!valid) return { message: 'Code invalide ou expiré' };
    await this.prisma.user.update({ where: { email: body.email }, data: { verified: true } });
    const user = await this.prisma.user.findUnique({ where: { email: body.email } });
    const token = this.jwt.sign({ sub: user.id, email: user.email, role: user.role });
    return { accessToken: token, refreshToken: token, role: user.role };
  }

  @Post('login')
  async login(@Body() body: any) {
    const user = await this.prisma.user.findUnique({ where: { email: body.email } });
    if (!user) return { message: 'Identifiants invalides' };
    const valid = await bcrypt.compare(body.password, user.password);
    if (!valid) return { message: 'Identifiants invalides' };
    const token = this.jwt.sign({ sub: user.id, email: user.email, role: user.role });
    return { accessToken: token, refreshToken: token, role: user.role };
  }

 @Get('me')
async getMe(@Headers('authorization') auth: string) {
  const token = auth?.replace('Bearer ', '');
  const payload = this.jwt.verify(token);
  const user = await this.prisma.user.findUnique({
    where: { id: payload.sub },
    include: { wallet: true },
  });
  return { name: user.name, email: user.email, role: user.role, balance: user.wallet?.balance || 0 };
@Post('recharge')
async recharge(@Headers('authorization') auth: string, @Body() body: { amount: number }) {
  const token = auth?.replace('Bearer ', '');
  const payload = this.jwt.verify(token);
  const wallet = await this.prisma.wallet.update({
    where: { userId: payload.sub },
    data: { balance: { increment: body.amount } },
  });
  return { balance: wallet.balance };
}}@Get('books-public')
async getBooks() {
  const books = await this.prisma.book.findMany({
    where: { status: 'PUBLISHED' },
    include: { author: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return books;
} @Get('google')
  async googleAuth(@Res() res: any) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const callbackUrl = process.env.GOOGLE_CALLBACK_URL;
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${callbackUrl}&response_type=code&scope=email profile`;
    return res.redirect(url);
  }

  @Get('google/callback')
  async googleCallback(@Query('code') code: string, @Res() res: any) {
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
      const tokenData: any = await tokenRes.json();
      const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const googleUser: any = await userRes.json();
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
      return res.redirect(`https://griotte-frontend-git-main-lawenignina.vercel.app/griotte-dashboard-lecteur.html?token=${token}`);
    } catch(e) {
      return res.redirect(`https://griotte-frontend-git-main-lawenignina.vercel.app/griotte-landing.html?error=google`);
    }
  }
}