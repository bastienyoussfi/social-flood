import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { User } from '../../lib/auth';

/**
 * Current User Decorator
 * Extracts the authenticated user from the request
 *
 * Usage:
 * @UseGuards(AuthGuard)
 * @Get('profile')
 * async getProfile(@CurrentUser() user: User) {
 *   return user;
 * }
 */
export const CurrentUser = createParamDecorator(
  (data: keyof User | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request & { user: User }>();
    const user = request.user;

    // If a specific property is requested, return just that property
    if (data) {
      return user?.[data];
    }

    return user;
  },
);
