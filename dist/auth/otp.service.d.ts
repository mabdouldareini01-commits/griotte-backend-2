import { PrismaService } from '../prisma/prisma.service';
export declare class OtpService {
    private prisma;
    constructor(prisma: PrismaService);
    generateOtp(): string;
    sendOtp(email: string, otp: string): Promise<void>;
    saveOtp(email: string, otp: string): Promise<void>;
    verifyOtp(email: string, code: string): Promise<boolean>;
}
