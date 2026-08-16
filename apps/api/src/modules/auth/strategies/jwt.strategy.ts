import { Injectable } from '@nestjs/common';
// Import de valor: necessário para o NestJS injetar via emitDecoratorMetadata.
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { jwtPayloadSchema, type JwtPayload } from '@pcaarb/shared';
import type { Env } from '../../../config/env.validation';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService<Env, true>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_ACCESS_SECRET', { infer: true }),
    });
  }

  validate(payload: unknown): JwtPayload {
    return jwtPayloadSchema.parse(payload);
  }
}
