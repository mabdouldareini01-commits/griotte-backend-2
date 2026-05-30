import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { BooksModule } from './books/books.module';
import { ChaptersModule } from './chapters/chapters.module';
import { ReadingModule } from './reading/reading.module';
import { TransactionsModule } from './transactions/transactions.module';
import { WalletsModule } from './wallets/wallets.module';
import { NotificationsModule } from './notifications/notifications.module';
import { WithdrawalsModule } from './withdrawals/withdrawals.module';

@Module({
  imports: [
    // ─── Config
    ConfigModule.forRoot({ isGlobal: true }),

    // ─── Rate limiting : 100 requêtes / 60s
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),

    // ─── Prisma
    PrismaModule,

    // ─── Feature modules
    AuthModule,
    UsersModule,
    BooksModule,
    ChaptersModule,
    ReadingModule,
    TransactionsModule,
    WalletsModule,
    NotificationsModule,
    WithdrawalsModule,
  ],
})
export class AppModule {}
