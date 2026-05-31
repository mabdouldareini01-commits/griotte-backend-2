import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { OtpService } from './otp.service';
export declare class AuthController {
    private prisma;
    private jwt;
    private otp;
    constructor(prisma: PrismaService, jwt: JwtService, otp: OtpService);
    register(body: any): Promise<{
        message: string;
        email?: undefined;
    } | {
        message: string;
        email: string;
    }>;
    verifyOtp(body: any): Promise<{
        message: string;
        accessToken?: undefined;
        refreshToken?: undefined;
        role?: undefined;
    } | {
        accessToken: string;
        refreshToken: string;
        role: import(".prisma/client").$Enums.Role;
        message?: undefined;
    }>;
    login(body: any): Promise<{
        message: string;
        accessToken?: undefined;
        refreshToken?: undefined;
    } | {
        accessToken: string;
        refreshToken: string;
        message?: undefined;
    }>;
    googleAuth(res: any): Promise<any>;
    googleCallback(code: string, res: any): Promise<any>;
}
