import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Rate limiting for HTTP requests only.
 *
 * Registered as a global guard, ThrottlerGuard would also run for websocket
 * events on the messages gateway, where there is no Express request to read
 * an IP from — so it would throw on every socket message. Socket traffic is
 * already behind a JWT handshake; this guard limits the HTTP API.
 */
@Injectable()
export class HttpThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    return super.shouldSkip(context);
  }
}
