import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { appConfig } from '../config/env.config.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];
    const queryToken = request.query?.token;

    let token = '';
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else if (queryToken) {
      token = queryToken.trim();
    }

    if (!token) {
      throw new UnauthorizedException('Yêu cầu đăng nhập hoặc phiên làm việc đã hết hạn');
    }

    try {
      const payload = this.jwtService.verify(token, { secret: appConfig.jwtSecret });
      request.user = {
        id: payload.sub,
        username: payload.username,
        role: payload.role,
        fullName: payload.fullName,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Phiên làm việc không hợp lệ hoặc đã hết hạn');
    }
  }
}
