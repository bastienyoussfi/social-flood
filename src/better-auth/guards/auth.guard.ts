import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { auth } from '../../lib/auth';
import type { Request } from 'express';

/**
 * Auth Guard
 * Protects routes that require authenticated users
 *
 * Usage:
 * @UseGuards(AuthGuard)
 * @Get('protected')
 * async protectedRoute(@Req() req: Request) {
 *   const user = req.user;
 *   // ...
 * }
 */
@Injectable()
export class AuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    try {
      // Get session from better-auth
      const session = await auth.api.getSession({
        headers: request.headers as Record<string, string>,
      });

      if (!session?.user) {
        throw new UnauthorizedException('Not authenticated');
      }

      // Attach user to request for use in route handlers
      (request as Request & { user: typeof session.user }).user = session.user;
      (request as Request & { session: typeof session.session }).session =
        session.session;

      return true;
    } catch {
      throw new UnauthorizedException('Not authenticated');
    }
  }
}
