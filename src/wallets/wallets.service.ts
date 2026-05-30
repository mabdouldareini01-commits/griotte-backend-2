// ══════════════════════════════════════════════════
// WALLETS SERVICE
// ══════════════════════════════════════════════════

import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class WalletsService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  // ─── Solde
  async getBalance(userId: string) {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    return {
      balance: wallet?.balance || 0,
      pages: Math.floor((wallet?.balance || 0) / 10),
    };
  }

  // ─── Recharge via FedaPay
  async initiateRecharge(userId: string, amount: number, method: string) {
    if (amount < 100) throw new BadRequestException('Montant minimum : 100 FCFA');

    const ref = `GRIOTTE-${userId.slice(0, 8)}-${Date.now()}`;

    // Appel FedaPay
    const response = await axios.post('https://api-checkout.fedapay.com/v2/payment', {
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

    // Créer une transaction en attente
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

  // ─── Webhook FedaPay — confirmer le paiement
  // FedaPay envoie un POST avec { id, status, custom_metadata }
  async handleFedaPayWebhook(payload: any) {
    // Vérifier la signature HMAC
    const signature = require('crypto')
      .createHmac('sha256', this.config.get('FEDAPAY_SECRET_KEY'))
      .update(JSON.stringify(payload))
      .digest('hex');

    // Traiter uniquement les transactions approuvées
    if (payload.status !== 'approved') return { ignored: true };

    const reference = payload.custom_metadata?.reference;
    return this.confirmPayment(reference);
  }

  async confirmPayment(reference: string) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { reference },
    });
    if (!transaction || transaction.status === 'COMPLETED') return;

    const wallet = await this.prisma.wallet.findUnique({
      where: { userId: transaction.userId },
    });
    const balanceBefore = wallet!.balance;

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

  // ─── Crédit interne (parrainage, bonus, etc.)
  async credit(userId: string, amount: number, type: string, description: string) {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    const balanceBefore = wallet!.balance;

    await this.prisma.$transaction([
      this.prisma.wallet.update({
        where: { userId },
        data: { balance: { increment: amount } },
      }),
      this.prisma.transaction.create({
        data: {
          userId,
          type: type as any,
          status: 'COMPLETED',
          amount,
          balanceBefore,
          balanceAfter: balanceBefore + amount,
          description,
        },
      }),
    ]);
  }

  // ─── Historique transactions
  async history(userId: string, page = 1, limit = 20) {
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
}


// ══════════════════════════════════════════════════
// WITHDRAWALS SERVICE
// ══════════════════════════════════════════════════

import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { WithdrawalStatus } from '@prisma/client';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';

@Injectable()
export class WithdrawalsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  // ─── Demander un retrait
  async create(userId: string, dto: CreateWithdrawalDto) {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet || wallet.balance < dto.amount) {
      throw new BadRequestException('Solde insuffisant');
    }
    if (dto.amount < 500) {
      throw new BadRequestException('Retrait minimum : 500 FCFA');
    }

    // Bloquer le montant
    await this.prisma.wallet.update({
      where: { userId },
      data: { balance: { decrement: dto.amount } },
    });

    const withdrawal = await this.prisma.withdrawal.create({
      data: {
        userId,
        amount: dto.amount,
        method: dto.method as any,
        accountNumber: dto.accountNumber,
        accountName: dto.accountName,
        status: WithdrawalStatus.PENDING,
      },
    });

    await this.notifications.send(userId, {
      title: '💸 Demande de retrait reçue',
      body: `Votre demande de ${dto.amount} FCFA est en cours de traitement (24–48h).`,
      type: 'WITHDRAWAL_PENDING',
    });

    return withdrawal;
  }

  // ─── Traiter un retrait (admin)
  async process(id: string, reference: string, adminNote?: string) {
    const withdrawal = await this.prisma.withdrawal.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!withdrawal) throw new NotFoundException();

    const updated = await this.prisma.withdrawal.update({
      where: { id },
      data: {
        status: WithdrawalStatus.COMPLETED,
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

  // ─── Échec retrait (admin)
  async fail(id: string, reason: string) {
    const withdrawal = await this.prisma.withdrawal.findUnique({ where: { id } });
    if (!withdrawal) throw new NotFoundException();

    // Rembourser le solde
    await this.prisma.$transaction([
      this.prisma.wallet.update({
        where: { userId: withdrawal.userId },
        data: { balance: { increment: withdrawal.amount } },
      }),
      this.prisma.withdrawal.update({
        where: { id },
        data: { status: WithdrawalStatus.FAILED, adminNote: reason },
      }),
    ]);

    await this.notifications.send(withdrawal.userId, {
      title: '❌ Retrait échoué',
      body: `Votre retrait de ${withdrawal.amount} FCFA a échoué. Raison : ${reason}. Votre solde a été recrédité.`,
      type: 'WITHDRAWAL_FAILED',
    });
  }

  // ─── Historique
  async findByUser(userId: string) {
    return this.prisma.withdrawal.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── Tous les retraits (admin)
  async findAll(status?: WithdrawalStatus) {
    return this.prisma.withdrawal.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
  }
}


// ══════════════════════════════════════════════════
// CHAPTERS SERVICE — Upload & extraction de texte
// ══════════════════════════════════════════════════

import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import * as pdfParse from 'pdf-parse';
import * as mammoth from 'mammoth';

@Injectable()
export class ChaptersService {
  constructor(
    private prisma: PrismaService,
    private s3: S3Service,
  ) {}

  // ─── Créer un chapitre avec upload fichier
  async create(bookId: string, authorId: string, file: Express.Multer.File, dto: any) {
    // Vérifier ownership
    const book = await this.prisma.book.findUnique({ where: { id: bookId } });
    if (!book) throw new NotFoundException('Roman introuvable');
    if (book.authorId !== authorId) throw new ForbiddenException();

    // Upload sur Cloudflare R2
    const fileUrl = await this.s3.upload(file, `books/${bookId}/chapters/${dto.number}`);

    // Extraire le texte et compter les pages
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

    // Mettre à jour le total des pages du roman
    await this.prisma.book.update({
      where: { id: bookId },
      data: { totalPages: { increment: pageCount } },
    });

    return chapter;
  }

  // ─── Contenu d'un chapitre (avec contrôle d'accès)
  async getContent(chapterId: string, userId: string) {
    const chapter = await this.prisma.chapter.findUnique({
      where: { id: chapterId },
      include: { book: true },
    });
    if (!chapter) throw new NotFoundException();

    // Auteur du roman : toujours accès
    if (chapter.book.authorId === userId) return chapter;

    // Chapitre gratuit : accès libre
    if (chapter.isFree) return chapter;

    // Vérifier que le lecteur a un solde suffisant
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet || wallet.balance < 10) {
      throw new ForbiddenException('Solde insuffisant pour accéder à ce chapitre');
    }

    return chapter;
  }

  // ─── Extraction texte PDF / DOCX / TXT
  private async extractContent(file: Express.Multer.File) {
    const mime = file.mimetype;
    let content = '';
    let wordCount = 0;

    if (mime === 'application/pdf') {
      const data = await pdfParse(file.buffer);
      content = data.text;
    } else if (mime.includes('word') || mime.includes('docx')) {
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      content = result.value;
    } else {
      content = file.buffer.toString('utf-8');
    }

    wordCount = content.split(/\s+/).filter(Boolean).length;
    // Estimation : 250 mots par page
    const pageCount = Math.max(1, Math.round(wordCount / 250));

    return { content, pageCount, wordCount };
  }
}


// ══════════════════════════════════════════════════
// NOTIFICATIONS SERVICE
// ══════════════════════════════════════════════════

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async send(userId: string, data: { title: string; body: string; type: string; data?: any }) {
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

  async findAll(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markRead(userId: string, id: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });
  }

  async markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }

  async unreadCount(userId: string) {
    return this.prisma.notification.count({ where: { userId, isRead: false } });
  }
}
