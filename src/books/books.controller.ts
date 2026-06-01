import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('books')
export class BooksController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async getBooks() {
    return this.prisma.book.findMany({
      where: { status: 'PUBLISHED' },
      include: { author: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}