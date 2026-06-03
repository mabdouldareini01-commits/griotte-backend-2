import { Controller, Post, Body, Get, Query, Res, Headers, UseGuards, Req, Param } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
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
  async register(@Body() body: { email: string; password: string; name: string; role: string }) {
    const existing = await this.prisma.user.findUnique({ where: { email: body.email } });
    if (existing) throw new Error('Email déjà utilisé');
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

  @Post('login')
  async login(@Body() body: { email: string; password: string }) {
    const user = await this.prisma.user.findUnique({ where: { email: body.email } });
    if (!user) throw new Error('Identifiants invalides');
    const valid = await bcrypt.compare(body.password, user.password || '');
    if (!valid) throw new Error('Identifiants invalides');
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
  }

  @Post('recharge')
  async recharge(@Headers('authorization') auth: string, @Body() body: { amount: number }) {
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

  @Get('wallets/balance')
  async getWalletBalance(@Headers('authorization') auth: string) {
    const token = auth?.replace('Bearer ', '');
    const payload = this.jwt.verify(token);
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId: payload.sub },
    });
    return { balance: wallet?.balance || 0 };
  }

  @Post('publish-book')
  async publishBook(@Headers('authorization') auth: string, @Body() body: { title: string; synopsis: string; genre: string; totalPages: number; tags?: string[]; coverImage?: string }) {
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
        tags: body.tags || [],
        coverImage: body.coverImage || null,
      },
    });
    return book;
  }

  @Get('books-public')
  async getBooks() {
    const books = await this.prisma.book.findMany({
      where: { status: 'PUBLISHED' },
      include: { author: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return books;
  }

  @Get('my-books')
  async getMyBooks(@Headers('authorization') auth: string) {
    try {
      const token = auth?.replace('Bearer ', '');
      const payload: any = this.jwt.verify(token);
      const authorId = payload.id || payload.userId || payload.sub;
      const books = await this.prisma.book.findMany({
        where: { authorId },
        orderBy: { createdAt: 'desc' },
      });
      return books;
    } catch(e) {
      return [];
    }
  }

  @Get('my-stats')
  async getMyStats(@Headers('authorization') auth: string) {
    try {
      const token = auth?.replace('Bearer ', '');
      const payload: any = this.jwt.verify(token);
      const authorId = payload.id || payload.userId || payload.sub;
      const books = await this.prisma.book.findMany({
        where: { authorId },
      });
      const totalBooks = books.length;
      const totalPages = books.reduce((sum: number, b: any) => sum + (b.totalPages || 0), 0);
      return { totalBooks, totalPages, totalReaders: 0, totalRevenue: 0, books };
    } catch(e) {
      return { totalBooks: 0, totalPages: 0, books: [] };
    }
  }

  @Get('google')
  async googleAuth(@Res() res: any) {
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.GOOGLE_CLIENT_ID}&redirect_uri=${process.env.GOOGLE_CALLBACK_URL}&response_type=code&scope=email profile`;
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
      return res.redirect(`https://griotte-frontend-git-main-lawenignina.vercel.app/griotte-dashboard.html?token=${token}`);
    } catch(e) {
      return res.redirect(`https://griotte-frontend-git-main-lawenignina.vercel.app/griotte-landing.html?error=google`);
    }
  }

  @Get('books/:id/chapters')
  async getBookChapters(@Param('id') bookId: string) {
    try {
      const chapters = await this.prisma.chapter.findMany({
        where: { bookId, isPublished: true },
        orderBy: { number: 'asc' },
        select: { id: true, number: true, title: true, content: true, pageCount: true, wordCount: true, isFree: true }
      });
      return chapters;
    } catch(e) { return []; }
  }

  @Post('books/:id/chapters')
  async addChapter(@Param('id') bookId: string, @Headers('authorization') auth: string, @Body() body: { title: string; content: string; number: number; isFree?: boolean }) {
    try {
      const token = auth?.replace('Bearer ', '');
      const payload: any = this.jwt.verify(token);
      const chapter = await this.prisma.chapter.create({
        data: {
          bookId,
          number: body.number || 1,
          title: body.title,
          content: body.content,
          wordCount: body.content ? body.content.split(/\s+/).length : 0,
          pageCount: body.content ? Math.ceil(body.content.split(/\s+/).length / 250) : 0,
          isFree: body.isFree || false,
          isPublished: true,
        }
      });
      return chapter;
    } catch(e) { return { error: e.message }; }
  }

  @Get('admin/users')
  async getAdminUsers(@Headers('authorization') auth: string) {
    try {
      const token = auth?.replace('Bearer ', '');
      const payload: any = this.jwt.verify(token);
      if (payload.role !== 'ADMIN') return { error: 'Unauthorized' };
      const users = await this.prisma.user.findMany({
        include: { wallet: true },
        orderBy: { createdAt: 'desc' },
      });
      return users;
    } catch(e) { return []; }
  }

  @Get('admin/stats')
  async getAdminStats(@Headers('authorization') auth: string) {
    try {
      const token = auth?.replace('Bearer ', '');
      const payload: any = this.jwt.verify(token);
      if (payload.role !== 'ADMIN') return { error: 'Unauthorized' };
      const totalUsers = await this.prisma.user.count();
      const totalBooks = await this.prisma.book.count();
      const totalAuthors = await this.prisma.user.count({ where: { role: 'AUTHOR' } });
      const totalReaders = await this.prisma.user.count({ where: { role: 'READER' } });
      const totalWallet = await this.prisma.wallet.aggregate({ _sum: { balance: true } });
      return { totalUsers, totalBooks, totalAuthors, totalReaders, totalBalance: totalWallet._sum.balance || 0 };
    } catch(e) { return {}; }
  }

  @Post('admin/suspend-user')
  async suspendUser(@Headers('authorization') auth: string, @Body() body: { userId: string; suspend: boolean }) {
    try {
      const token = auth?.replace('Bearer ', '');
      const payload: any = this.jwt.verify(token);
      if (payload.role !== 'ADMIN') return { error: 'Unauthorized' };
      const user = await this.prisma.user.update({
        where: { id: body.userId },
        data: { isSuspended: body.suspend },
      });
      return { success: true, user };
    } catch(e) { return { error: 'Failed' }; }
  }

  @Post('admin/verify-author')
  async verifyAuthor(@Headers('authorization') auth: string, @Body() body: { userId: string }) {
    try {
      const token = auth?.replace('Bearer ', '');
      const payload: any = this.jwt.verify(token);
      if (payload.role !== 'ADMIN') return { error: 'Unauthorized' };
      const user = await this.prisma.user.update({
        where: { id: body.userId },
        data: { role: 'AUTHOR', isVerified: true },
      });
      return { success: true, user };
    } catch(e) { return { error: 'Failed' }; }
  }
}