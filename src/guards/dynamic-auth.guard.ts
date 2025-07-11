import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthUtil } from '../utils/auth.util';

@Injectable()
export class DynamicAuthGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const timestamp = request.headers['x-timestamp'];
    const signature = request.headers['x-signature'];

    if (!timestamp || !signature) {
      throw new UnauthorizedException('缺少认证信息');
    }

    const secretKey = this.configService.get<string>('AUTH_SECRET_KEY');
    if (!secretKey) {
      throw new UnauthorizedException('服务器配置错误');
    }

    const isValid = AuthUtil.verifyDynamicAuth(
      parseInt(timestamp),
      signature,
      secretKey
    );

    if (!isValid) {
      throw new UnauthorizedException('认证失败');
    }

    return true;
  }
} 