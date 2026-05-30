// ══════════════════════════════════════════════════
// READING MODULE — Cœur du modèle économique
// 10 FCFA/page · 60% auteur · 40% GRIOTTE
// ══════════════════════════════════════════════════

// ─── reading.service.ts ───────────────────────────
import {
  Injectable, NotFoundException,
  BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StartSessionDto } from './dto/start-session.dto';
import { EndSessionDto } from './dto/end-session.dto';

const PRICE_PER_PAGE = 10;       // FCFA
const AUTHOR_SHARE   = 0.60;     // 60%
const PLATFORM_SHARE = 0.40;     // 40%

@Injectable()
export class ReadingService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  // ─── Démarrer une session de lecture
  async startSession(userId: string, dto: StartSessionDto) {
    const { bookId, chapterId, startPage } = dto;

    // Vérifier le roman
    const book = await this.prisma.book.findUnique({
      where: { id: bookId },
      include: { author: true },
    });
    if (!book) throw new NotFoundException('Roman introuvable');

    // Vérifier le chapitre
    const chapter = await this.prisma.chapter.findUnique({
      where: { id: chapterId },
    });
    if (!chapter) throw new NotFoundException('Chapitre introuvable');

    // Chapitre gratuit ou payant
    if (!chapter.isFree) {
      // Vérifier le solde (au moins 1 page = 10 FCFA)
      const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
      if (!wallet || wallet.balance < PRICE_PER_PAGE) {
        throw new BadRequestException('Solde insuffisant — rechargez votre portefeuille');
      }
    }

    // Créer la session
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

  // ─── Terminer une session et facturer
  async endSession(userId: string, sessionId: string, dto: EndSessionDto) {
    const session = await this.prisma.readingSession.findUnique({
      where: { id: sessionId },
      include: { book: { include: { author: true } }, chapter: true },
    });

    if (!session) throw new NotFoundException('Session introuvable');
    if (session.userId !== userId) throw new ForbiddenException();
    if (session.endedAt) throw new BadRequestException('Session déjà terminée');

    const { endPage, duration } = dto;
    const pagesRead = Math.max(0, endPage - session.startPage);

    // Chapitre gratuit — pas de facturation
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

    // ─── Calcul des montants
    const totalDebit   = pagesRead * PRICE_PER_PAGE;
    const authorAmount = Math.floor(totalDebit * AUTHOR_SHARE);   // arrondi bas
    const platformAmount = totalDebit - authorAmount;              // le reste

    // ─── Vérifier le solde
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet || wallet.balance < totalDebit) {
      // Facturer seulement les pages possibles avec le solde
      const affordablePages = Math.floor(wallet!.balance / PRICE_PER_PAGE);
      if (affordablePages === 0) {
        throw new BadRequestException('Solde épuisé');
      }
      // Recalculer
      return this.endSession(userId, sessionId, { endPage: session.startPage + affordablePages, duration });
    }

    // ─── Transaction atomique
    const [updatedSession] = await this.prisma.$transaction([

      // 1. Mettre à jour la session
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

      // 2. Débiter le lecteur
      this.prisma.wallet.update({
        where: { userId },
        data: { balance: { decrement: totalDebit } },
      }),

      // 3. Créditer l'auteur (60%)
      this.prisma.wallet.update({
        where: { userId: session.book.authorId },
        data: { balance: { increment: authorAmount } },
      }),

      // 4. Transaction lecteur (débit)
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

      // 5. Transaction auteur (crédit)
      this.prisma.transaction.create({
        data: {
          userId: session.book.authorId,
          type: 'AUTHOR_CREDIT',
          status: 'COMPLETED',
          amount: authorAmount,
          balanceBefore: 0, // recalculé côté client
          balanceAfter: 0,
          description: `Pages lues sur "${session.book.title}" (${pagesRead} p.)`,
        },
      }),

      // 6. Stats livre
      this.prisma.book.update({
        where: { id: session.bookId },
        data: {
          totalReads: { increment: pagesRead },
          totalRevenue: { increment: authorAmount },
        },
      }),
    ]);

    // ─── Notification auteur (si > 50 FCFA gagnés en une session)
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

  // ─── Historique de lecture d'un utilisateur
  async userHistory(userId: string, page = 1, limit = 20) {
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

  // ─── Progression dans un livre
  async getProgress(userId: string, bookId: string) {
    const sessions = await this.prisma.readingSession.findMany({
      where: { userId, bookId },
      orderBy: { startedAt: 'desc' },
    });

    if (!sessions.length) return null;

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
}

// ─── reading.controller.ts ────────────────────────
import {
  Controller, Post, Get, Param, Body,
  UseGuards, Req, Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ReadingService } from './reading.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StartSessionDto } from './dto/start-session.dto';
import { EndSessionDto } from './dto/end-session.dto';

@ApiTags('reading')
@Controller('reading')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ReadingController {
  constructor(private reading: ReadingService) {}

  @Post('start')
  @ApiOperation({ summary: 'Démarrer une session de lecture' })
  start(@Req() req: any, @Body() dto: StartSessionDto) {
    return this.reading.startSession(req.user.id, dto);
  }

  @Post(':sessionId/end')
  @ApiOperation({ summary: 'Terminer une session — déclenche la facturation' })
  end(@Req() req: any, @Param('sessionId') id: string, @Body() dto: EndSessionDto) {
    return this.reading.endSession(req.user.id, id, dto);
  }

  @Get('history')
  @ApiOperation({ summary: 'Historique de lecture' })
  history(@Req() req: any, @Query('page') page: number, @Query('limit') limit: number) {
    return this.reading.userHistory(req.user.id, page, limit);
  }

  @Get('progress/:bookId')
  @ApiOperation({ summary: 'Progression dans un roman' })
  progress(@Req() req: any, @Param('bookId') bookId: string) {
    return this.reading.getProgress(req.user.id, bookId);
  }
}

// ─── dto/start-session.dto.ts ─────────────────────
import { IsString, IsOptional, IsInt } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class StartSessionDto {
  @ApiProperty() @IsString() bookId: string;
  @ApiProperty() @IsString() chapterId: string;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() startPage?: number;
}

export class EndSessionDto {
  @ApiProperty() @IsInt() endPage: number;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() duration?: number;
}
