// ══════════════════════════════════════════════════
// BOOKS MODULE
// ══════════════════════════════════════════════════

// ─── books.service.ts ─────────────────────────────
import {
  Injectable, NotFoundException, ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BookStatus, Role } from '@prisma/client';
import { CreateBookDto } from './dto/create-book.dto';
import { UpdateBookDto } from './dto/update-book.dto';
import { BookQueryDto } from './dto/book-query.dto';

@Injectable()
export class BooksService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  // ─── Créer un roman
  async create(authorId: string, dto: CreateBookDto) {
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
        status: BookStatus.DRAFT,
      },
      include: { author: { select: { id: true, name: true, country: true } } },
    });
  }

  // ─── Catalogue public (avec filtres)
  async findAll(query: BookQueryDto) {
    const {
      search, genre, country, language,
      minRating, maxPages, minPages,
      page = 1, limit = 24, sort = 'trending',
    } = query;

    const where: any = {
      status: BookStatus.PUBLISHED,
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

    if (genre) where.genre = { contains: genre, mode: 'insensitive' };
    if (country) where.country = country;
    if (language) where.language = language;
    if (minRating) where.averageRating = { gte: minRating };
    if (maxPages) where.totalPages = { ...where.totalPages, lte: maxPages };
    if (minPages) where.totalPages = { ...where.totalPages, gte: minPages };

    const orderBy: any = {
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

  // ─── Fiche d'un roman
  async findOne(id: string, userId?: string) {
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

    if (!book) throw new NotFoundException('Roman introuvable');
    if (book.status !== BookStatus.PUBLISHED && book.authorId !== userId) {
      throw new ForbiddenException('Roman non publié');
    }

    // Bookmark de l'utilisateur
    let userBookmark = null;
    if (userId) {
      userBookmark = await this.prisma.bookmark.findUnique({
        where: { userId_bookId: { userId, bookId: id } },
      });
    }

    return { ...book, userBookmark };
  }

  // ─── Mettre à jour
  async update(id: string, userId: string, role: Role, dto: UpdateBookDto) {
    const book = await this.prisma.book.findUnique({ where: { id } });
    if (!book) throw new NotFoundException();
    if (book.authorId !== userId && role !== Role.ADMIN) throw new ForbiddenException();
    if (book.status === BookStatus.PUBLISHED && role !== Role.ADMIN) {
      throw new ForbiddenException('Un roman publié ne peut être modifié que par un admin');
    }

    return this.prisma.book.update({
      where: { id },
      data: { ...dto, status: BookStatus.DRAFT },
    });
  }

  // ─── Soumettre pour validation
  async submit(id: string, userId: string) {
    const book = await this.prisma.book.findUnique({
      where: { id },
      include: { chapters: true },
    });
    if (!book) throw new NotFoundException();
    if (book.authorId !== userId) throw new ForbiddenException();
    if (book.chapters.length === 0) {
      throw new BadRequestException('Ajoutez au moins un chapitre avant de soumettre');
    }

    return this.prisma.book.update({
      where: { id },
      data: { status: BookStatus.PENDING_REVIEW },
    });
  }

  // ─── Valider (admin)
  async approve(id: string) {
    const book = await this.prisma.book.update({
      where: { id },
      data: { status: BookStatus.PUBLISHED, publishedAt: new Date() },
      include: { author: true },
    });

    await this.notifications.send(book.authorId, {
      title: '🎉 Roman publié !',
      body: `"${book.title}" est maintenant visible dans le catalogue GRIOTTE.`,
      type: 'BOOK_PUBLISHED',
    });

    return book;
  }

  // ─── Rejeter (admin)
  async reject(id: string, note: string) {
    const book = await this.prisma.book.update({
      where: { id },
      data: { status: BookStatus.REJECTED, rejectionNote: note },
      include: { author: true },
    });

    await this.notifications.send(book.authorId, {
      title: '📝 Corrections demandées',
      body: `"${book.title}" nécessite des modifications : ${note}`,
      type: 'BOOK_REJECTED',
    });

    return book;
  }

  // ─── Mes romans (auteur)
  async findByAuthor(authorId: string) {
    return this.prisma.book.findMany({
      where: { authorId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { reviews: true, readingSessions: true } },
      },
    });
  }

  // ─── Stats auteur
  async authorStats(authorId: string) {
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
}

// ─── books.controller.ts ──────────────────────────
import {
  Controller, Get, Post, Put, Delete, Body, Param,
  Query, UseGuards, Req, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { BooksService } from './books.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { OptionalJwtGuard } from '../auth/guards/optional-jwt.guard';
import { CreateBookDto } from './dto/create-book.dto';
import { UpdateBookDto } from './dto/update-book.dto';
import { BookQueryDto } from './dto/book-query.dto';
import { Role } from '@prisma/client';

@ApiTags('books')
@Controller('books')
export class BooksController {
  constructor(private books: BooksService) {}

  // ─── Catalogue public
  @Get()
  @UseGuards(OptionalJwtGuard)
  @ApiOperation({ summary: 'Catalogue public avec filtres et recherche' })
  findAll(@Query() query: BookQueryDto) {
    return this.books.findAll(query);
  }

  // ─── Mes romans
  @Get('mine')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Romans de l\'auteur connecté' })
  mine(@Req() req: any) {
    return this.books.findByAuthor(req.user.id);
  }

  // ─── Stats auteur
  @Get('mine/stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  authorStats(@Req() req: any) {
    return this.books.authorStats(req.user.id);
  }

  // ─── Fiche roman
  @Get(':id')
  @UseGuards(OptionalJwtGuard)
  @ApiOperation({ summary: 'Fiche détaillée d\'un roman' })
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.books.findOne(id, req.user?.id);
  }

  // ─── Créer
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.AUTHOR, Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Créer un nouveau roman (auteur)' })
  create(@Req() req: any, @Body() dto: CreateBookDto) {
    return this.books.create(req.user.id, dto);
  }

  // ─── Modifier
  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  update(@Param('id') id: string, @Req() req: any, @Body() dto: UpdateBookDto) {
    return this.books.update(id, req.user.id, req.user.role, dto);
  }

  // ─── Soumettre pour validation
  @Post(':id/submit')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.AUTHOR)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soumettre le roman à la validation éditoriale' })
  submit(@Param('id') id: string, @Req() req: any) {
    return this.books.submit(id, req.user.id);
  }

  // ─── Valider (admin)
  @Post(':id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  approve(@Param('id') id: string) {
    return this.books.approve(id);
  }

  // ─── Rejeter (admin)
  @Post(':id/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  reject(@Param('id') id: string, @Body('note') note: string) {
    return this.books.reject(id, note);
  }
}

// ─── dto/create-book.dto.ts ───────────────────────
import { IsString, IsOptional, IsBoolean, IsInt, IsArray } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateBookDto {
  @ApiProperty() @IsString() title: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() subtitle?: string;
  @ApiProperty() @IsString() synopsis: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() coverColor?: string;
  @ApiProperty() @IsString() genre: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() subGenre?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() country?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() language?: string;
  @ApiProperty({ type: [String], required: false }) @IsOptional() @IsArray() tags?: string[];
  @ApiProperty({ required: false }) @IsOptional() @IsString() targetAudience?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() sensitiveContent?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() authorNote?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsBoolean() isFreeFirst?: boolean;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() yearWritten?: number;
}

export class UpdateBookDto extends CreateBookDto {}

export class BookQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() genre?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() language?: string;
  @IsOptional() minRating?: number;
  @IsOptional() maxPages?: number;
  @IsOptional() minPages?: number;
  @IsOptional() page?: number;
  @IsOptional() limit?: number;
  @IsOptional() @IsString() sort?: string;
}
