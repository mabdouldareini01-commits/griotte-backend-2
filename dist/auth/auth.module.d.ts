import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
export declare class AuthModule {
}
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { WalletsService } from '../wallets/wallets.service';
import { RegisterDto } from './dto/register.dto';
import { Role } from '@prisma/client';
export declare class AuthService {
    private prisma;
    private jwt;
    private wallets;
    private config;
    constructor(prisma: PrismaService, jwt: JwtService, wallets: WalletsService, config: ConfigService);
    register(dto: RegisterDto): Promise<{
        accessToken: string;
        refreshToken: any;
        expiresIn: number;
    }>;
    validateUser(email: string, password: string): Promise<any>;
    googleLogin(googleUser: any): Promise<{
        accessToken: string;
        refreshToken: any;
        expiresIn: number;
    }>;
    refresh(token: string): Promise<{
        accessToken: string;
        refreshToken: any;
        expiresIn: number;
    }>;
    logout(token: string): Promise<void>;
    private generateTokens;
    private processReferral;
}
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
export declare class AuthController {
    private auth;
    constructor(auth: AuthService);
    register(dto: RegisterDto): any;
    login(req: any, _dto: LoginDto): any;
    googleLogin(): void;
    googleCallback(req: any): any;
    refresh(dto: RefreshDto): any;
    logout(dto: RefreshDto): any;
    : any;
}
export declare class RegisterDto {
    email: string;
    password: string;
    name: string;
    country?: string;
    role?: Role;
    referralCode?: string;
}
export declare class LoginDto {
    email: string;
    password: string;
}
export declare class RefreshDto {
    refreshToken: string;
}
