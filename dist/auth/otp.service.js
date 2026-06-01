"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OtpService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const nodemailer = require("nodemailer");
let OtpService = class OtpService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    generateOtp() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }
    async sendOtp(email, otp) {
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
    async saveOtp(email, otp) {
        const expires = new Date(Date.now() + 10 * 60 * 1000);
        await this.prisma.otp.upsert({
            where: { email },
            update: { code: otp, expires },
            create: { email, code: otp, expires },
        });
    }
    async verifyOtp(email, code) {
        const otp = await this.prisma.otp.findUnique({ where: { email } });
        if (!otp)
            return false;
        if (otp.code !== code)
            return false;
        if (otp.expires < new Date())
            return false;
        await this.prisma.otp.delete({ where: { email } });
        return true;
    }
};
exports.OtpService = OtpService;
exports.OtpService = OtpService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], OtpService);
//# sourceMappingURL=otp.service.js.map