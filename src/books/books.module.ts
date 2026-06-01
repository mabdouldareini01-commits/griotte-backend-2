import { Module } from '@nestjs/common';
import { BooksController } from './books.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [BooksController],
  providers: [PrismaService],
})
export class BooksModule {}