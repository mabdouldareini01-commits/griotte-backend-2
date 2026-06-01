import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as nodemailer from 'nodemailer';

@Injectable()
export class OtpService {
  constructor(private prisma: PrismaService) {}

  generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async sendOtp(email: string, otp: string) {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASSWORD,
      },
    });

    await transporter.sendMail({
      from: `"GRIOTTE" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: 'Votre code de vérification GRIOTTE',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:2rem;background:#1a1612;color:#fff;border-radius:12px;">
          <h2 style="color:#D9902D;">🍒 GRIOTTE</h2>
          <p>Votre code de vérification est :</p>
          <h1 style="color:#D9902D;font-size:2.5rem;letter-spacing:0.5rem;">${otp}</h1>
          <p>Ce code expire dans 10 minutes.</p>
        </div>
      `,
    });
  }

  async saveOtp(email: string, otp: string) {
    const expires = new Date(Date.now() + 10 * 60 * 1000);
    await this.prisma.otp.upsert({
      where: { email },
      update: { code: otp, expires },
      create: { email, code: otp, expires },
    });
  }

  async verifyOtp(email: string, code: string): Promise<boolean> {
    const otp = await this.prisma.otp.findUnique({ where: { email } });
    if (!otp) return false;
    if (otp.code !== code) return false;
    if (otp.expires < new Date()) return false;
    await this.prisma.otp.delete({ where: { email } });
    return true;
  }
}