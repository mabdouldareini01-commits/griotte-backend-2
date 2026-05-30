import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
export declare class AuthController {
    private prisma;
    private jwt;
    constructor(prisma: PrismaService, jwt: JwtService);
    register(body: any): Promise<{
        accessToken: string;
        refreshToken: string;
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
}
