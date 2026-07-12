import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { hash, verify } from 'argon2';
import { Env } from '../config/env';
import { LoginInput, RefreshInput, RegisterInput } from '../domain/auth.schema';
import { PrismaService } from '../prisma/prisma.service';
import { AuthResponseDto, UserDto } from './dto/auth-response.dto';
import { AccessTokenPayload } from './strategies/jwt.strategy';

interface RefreshTokenPayload {
  sub: string;
  typ: 'refresh';
}

interface UserRecord {
  id: string;
  email: string;
  name: string | null;
  role: UserDto['role'];
  passwordHash: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async register(input: RegisterInput): Promise<AuthResponseDto> {
    const existing = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Email is already registered');
    }
    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        passwordHash: await hash(input.password),
        name: input.name ?? null,
      },
    });
    return this.buildAuthResult(user);
  }

  async login(input: LoginInput): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
    });
    if (!user || !(await verify(user.passwordHash, input.password))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.buildAuthResult(user);
  }

  async refresh(input: RefreshInput): Promise<AuthResponseDto> {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshTokenPayload>(
        input.refreshToken,
        { secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }) },
      );
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    if (payload.typ !== 'refresh') {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    return this.buildAuthResult(user);
  }

  async getMe(userId: string): Promise<UserDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException();
    }
    return AuthService.toUserDto(user);
  }

  private async buildAuthResult(user: UserRecord): Promise<AuthResponseDto> {
    const accessPayload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    const refreshPayload: RefreshTokenPayload = {
      sub: user.id,
      typ: 'refresh',
    };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(accessPayload, {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
        expiresIn: this.config.get('JWT_ACCESS_TTL', { infer: true }),
      }),
      this.jwt.signAsync(refreshPayload, {
        secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
        expiresIn: this.config.get('JWT_REFRESH_TTL', { infer: true }),
      }),
    ]);
    return { user: AuthService.toUserDto(user), accessToken, refreshToken };
  }

  /** passwordHash must never leave the service. */
  private static toUserDto(user: UserRecord): UserDto {
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }
}
