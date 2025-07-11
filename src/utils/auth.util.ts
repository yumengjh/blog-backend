import * as crypto from 'crypto';

export class AuthUtil {
  private static readonly TIME_TOLERANCE = 30; // 允许的时间误差（秒）

  /**
   * 生成动态密钥
   * @param secretKey 服务器密钥
   * @returns { timestamp: number; signature: string }
   */
  static generateDynamicAuth(secretKey: string) {
    const timestamp = Math.floor(Date.now() / 1000); // 转换为秒
    const signature = this.generateSignature(timestamp, secretKey);
    return { timestamp, signature };
  }

  /**
   * 验证动态密钥
   * @param timestamp 客户端时间戳
   * @param signature 客户端签名
   * @param secretKey 服务器密钥
   */
  static verifyDynamicAuth(timestamp: number, signature: string, secretKey: string): boolean {
    const currentTime = Math.floor(Date.now() / 1000);
    
    // 检查时间戳是否在允许范围内
    if (Math.abs(currentTime - timestamp) > this.TIME_TOLERANCE) {
      return false;
    }

    // 生成服务器端签名并比对
    const serverSignature = this.generateSignature(timestamp, secretKey);
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(serverSignature)
    );
  }

  /**
   * 生成签名
   * @param timestamp 时间戳
   * @param secretKey 密钥
   */
  private static generateSignature(timestamp: number, secretKey: string): string {
    return crypto
      .createHmac('sha256', secretKey)
      .update(timestamp.toString())
      .digest('hex');
  }
} 