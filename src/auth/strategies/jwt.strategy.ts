import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Env } from '../../config/env';
import { Role } from '../../generated/prisma/enums';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: Role;
}

/** Shape attached to request.user by the strategy. */
export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: Role;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService<Env, true>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get('JWT_ACCESS_SECRET', { infer: true }),
      ignoreExpiration: false,
    });
  }

  validate(payload: AccessTokenPayload): AuthenticatedUser {
    return { userId: payload.sub, email: payload.email, role: payload.role };
  }
}
