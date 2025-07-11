# Node.js Crypto 模块完全指南

## 目录
1. [简介](#简介)
2. [基础概念](#基础概念)
3. [常见加密算法](#常见加密算法)
4. [实践教程](#实践教程)
5. [最佳实践](#最佳实践)
6. [常见陷阱](#常见陷阱)
7. [性能考虑](#性能考虑)
8. [安全建议](#安全建议)

## 简介

Node.js 的 `crypto` 模块是一个强大的内置加密库，提供了包括哈希、HMAC、加密、解密、签名和证书等功能。本教程将帮助你全面了解如何在现代 JavaScript/TypeScript 项目中使用它。

### 环境准备
```bash
# 创建项目目录
mkdir crypto-demo
cd crypto-demo

# 初始化项目
npm init -y

# 添加 TypeScript 支持
npm install typescript @types/node --save-dev

# 创建 tsconfig.json
npx tsc --init
```

修改 `package.json`，添加 type: "module" 以支持 ESM：
```json
{
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js"
  }
}
```

## 基础概念

### 1. 哈希（Hash）
哈希是一种单向函数，将任意大小的数据转换为固定大小的值。

```typescript
// hash.ts
import { createHash } from 'crypto';

export function hashData(data: string, algorithm = 'sha256'): string {
  return createHash(algorithm)
    .update(data)
    .digest('hex');
}

// 使用示例
const hash1 = hashData('hello');  // 使用默认的 sha256
const hash2 = hashData('hello', 'md5');  // 使用 MD5
```

常用哈希算法：
- md5（不推荐用于安全场景）
- sha1（不推荐用于安全场景）
- sha256（推荐）
- sha512（推荐）

### 2. HMAC（哈希消息认证码）
HMAC 是一种将哈希算法与密钥结合的技术，用于验证消息的完整性和真实性。

```typescript
// hmac.ts
import { createHmac } from 'crypto';

export class HMACHelper {
  constructor(private readonly secretKey: string) {}

  generate(data: string, algorithm = 'sha256'): string {
    return createHmac(algorithm, this.secretKey)
      .update(data)
      .digest('hex');
  }

  verify(data: string, hmac: string, algorithm = 'sha256'): boolean {
    const calculatedHmac = this.generate(data, algorithm);
    return calculatedHmac === hmac;
  }
}

// 使用示例
const hmacHelper = new HMACHelper('your-secret-key');
const signature = hmacHelper.generate('hello');
const isValid = hmacHelper.verify('hello', signature);  // true
```

### 3. 对称加密
对称加密使用同一个密钥进行加密和解密。

```typescript
// symmetric.ts
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

export class SymmetricEncryption {
  private readonly algorithm = 'aes-256-gcm';
  private readonly key: Buffer;

  constructor(password: string) {
    // 使用 scrypt 从密码生成密钥
    const salt = randomBytes(16);
    this.key = scryptSync(password, salt, 32);
  }

  encrypt(text: string): {
    encrypted: string;
    iv: string;
    tag: string;
  } {
    const iv = randomBytes(12);
    const cipher = createCipheriv(this.algorithm, this.key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return {
      encrypted,
      iv: iv.toString('hex'),
      tag: cipher.getAuthTag().toString('hex'),
    };
  }

  decrypt(encrypted: string, iv: string, tag: string): string {
    const decipher = createDecipheriv(
      this.algorithm,
      this.key,
      Buffer.from(iv, 'hex')
    );

    decipher.setAuthTag(Buffer.from(tag, 'hex'));

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}

// 使用示例
const encryption = new SymmetricEncryption('your-password');
const { encrypted, iv, tag } = encryption.encrypt('secret message');
const decrypted = encryption.decrypt(encrypted, iv, tag);
```

### 4. 密码哈希
用于安全存储密码的专门哈希实现。

```typescript
// password.ts
import { randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

export class PasswordHash {
  static async hash(password: string): Promise<string> {
    const salt = randomBytes(16).toString('hex');
    const derivedKey = await scryptAsync(password, salt, 64);
    return `${salt}:${derivedKey.toString('hex')}`;
  }

  static async verify(password: string, hash: string): Promise<boolean> {
    const [salt, key] = hash.split(':');
    const derivedKey = await scryptAsync(password, salt, 64);
    const keyBuffer = Buffer.from(key, 'hex');
    return timingSafeEqual(derivedKey, keyBuffer);
  }
}

// 使用示例
async function demo() {
  const password = 'user-password';
  const hashedPassword = await PasswordHash.hash(password);
  const isValid = await PasswordHash.verify(password, hashedPassword);
}
```

### 5. 随机数生成
安全的随机数生成对于加密操作至关重要。

```typescript
// random.ts
import { randomBytes, randomInt } from 'crypto';

export class RandomGenerator {
  static bytes(size: number): Buffer {
    return randomBytes(size);
  }

  static string(length: number): string {
    return randomBytes(Math.ceil(length / 2))
      .toString('hex')
      .slice(0, length);
  }

  static number(min: number, max: number): number {
    return randomInt(min, max);
  }

  static async uuid(): Promise<string> {
    const bytes = randomBytes(16);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    
    return bytes.toString('hex').match(/.{8,8}/g)!.join('-');
  }
}

// 使用示例
const randomString = RandomGenerator.string(32);
const randomNum = RandomGenerator.number(1, 100);
const uuid = await RandomGenerator.uuid();
```

## 实践示例

### 1. 安全的会话令牌生成器

```typescript
// session.ts
import { randomBytes, createHash } from 'crypto';

export class SessionTokenManager {
  private static readonly TOKEN_LENGTH = 32;
  private static readonly HASH_ALGORITHM = 'sha256';

  static generate(): string {
    return randomBytes(this.TOKEN_LENGTH).toString('hex');
  }

  static hash(token: string): string {
    return createHash(this.HASH_ALGORITHM)
      .update(token)
      .digest('hex');
  }

  static verify(token: string, hashedToken: string): boolean {
    const calculatedHash = this.hash(token);
    return calculatedHash === hashedToken;
  }
}
```

### 2. 文件加密工具

```typescript
// file-encryption.ts
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

export class FileEncryption {
  private readonly algorithm = 'aes-256-gcm';
  private readonly key: Buffer;

  constructor(password: string) {
    const salt = randomBytes(16);
    this.key = scryptSync(password, salt, 32);
  }

  async encrypt(inputPath: string, outputPath: string): Promise<{
    iv: string;
    tag: string;
  }> {
    const iv = randomBytes(12);
    const cipher = createCipheriv(this.algorithm, this.key, iv);
    
    const input = createReadStream(inputPath);
    const output = createWriteStream(outputPath);

    await pipeline(input, cipher, output);

    return {
      iv: iv.toString('hex'),
      tag: cipher.getAuthTag().toString('hex'),
    };
  }

  async decrypt(
    inputPath: string,
    outputPath: string,
    iv: string,
    tag: string
  ): Promise<void> {
    const decipher = createDecipheriv(
      this.algorithm,
      this.key,
      Buffer.from(iv, 'hex')
    );
    
    decipher.setAuthTag(Buffer.from(tag, 'hex'));

    const input = createReadStream(inputPath);
    const output = createWriteStream(outputPath);

    await pipeline(input, decipher, output);
  }
}
```

### 3. API 请求签名验证

```typescript
// api-auth.ts
import { createHmac } from 'crypto';

export class APIAuthenticator {
  constructor(private readonly secretKey: string) {}

  generateSignature(method: string, path: string, timestamp: number, body?: string): string {
    const data = `${method.toUpperCase()}${path}${timestamp}${body || ''}`;
    return createHmac('sha256', this.secretKey)
      .update(data)
      .digest('hex');
  }

  verifyRequest(
    method: string,
    path: string,
    timestamp: number,
    signature: string,
    body?: string
  ): boolean {
    // 检查时间戳是否在允许范围内（如 5 分钟）
    const now = Date.now();
    if (Math.abs(now - timestamp) > 5 * 60 * 1000) {
      return false;
    }

    const expectedSignature = this.generateSignature(method, path, timestamp, body);
    return expectedSignature === signature;
  }
}
```

## 最佳实践

### 1. 密钥管理
- 使用环境变量存储敏感信息
- 定期轮换密钥
- 使用密钥派生函数（如 scrypt）处理密码

```typescript
// key-management.ts
import { config } from 'dotenv';
import { scryptSync, randomBytes } from 'crypto';

config(); // 加载 .env 文件

export class KeyManager {
  private static readonly KEY_LENGTH = 32;
  private static readonly SALT_LENGTH = 16;

  static deriveKey(password: string): { key: Buffer; salt: Buffer } {
    const salt = randomBytes(this.SALT_LENGTH);
    const key = scryptSync(password, salt, this.KEY_LENGTH);
    return { key, salt };
  }

  static getSecretKey(): string {
    const key = process.env.SECRET_KEY;
    if (!key) {
      throw new Error('SECRET_KEY environment variable is not set');
    }
    return key;
  }
}
```

### 2. 错误处理

```typescript
// error-handling.ts
export class CryptoError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'CryptoError';
  }
}

export function handleCryptoOperation<T>(
  operation: () => T,
  errorCode: string
): T {
  try {
    return operation();
  } catch (error) {
    throw new CryptoError(
      error instanceof Error ? error.message : 'Unknown error',
      errorCode
    );
  }
}
```

### 3. 性能优化

```typescript
// performance.ts
import { createHash } from 'crypto';

export class HashCache {
  private cache = new Map<string, string>();
  private readonly maxSize: number;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  hash(data: string): string {
    if (this.cache.has(data)) {
      return this.cache.get(data)!;
    }

    const hash = createHash('sha256')
      .update(data)
      .digest('hex');

    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(data, hash);
    return hash;
  }
}
```

## 安全建议

1. **算法选择**
- 使用现代加密算法（AES-GCM、ChaCha20-Poly1305）
- 避免使用过时算法（DES、MD5、SHA1）
- 使用足够长的密钥（AES-256、RSA-2048+）

2. **密码处理**
- 始终使用盐值
- 使用专门的密码哈希函数
- 实现速率限制

3. **随机数生成**
- 只使用 crypto.randomBytes()
- 避免使用 Math.random()
- 为每个操作使用新的随机值

4. **错误处理**
- 不泄露敏感信息
- 实现适当的日志记录
- 使用通用错误消息

## 常见陷阱

1. **初始化向量（IV）重用**
```typescript
// ❌ 错误示例
const iv = Buffer.alloc(16, 0);  // 永远不要重用 IV

// ✅ 正确示例
const iv = randomBytes(16);  // 每次加密使用新的 IV
```

2. **不安全的比较**
```typescript
// ❌ 错误示例
if (userHash === storedHash) {  // 容易受到时序攻击

// ✅ 正确示例
import { timingSafeEqual } from 'crypto';
if (timingSafeEqual(Buffer.from(userHash), Buffer.from(storedHash))) {
```

3. **弱密钥生成**
```typescript
// ❌ 错误示例
const key = 'my-secret-key';  // 永远不要使用硬编码的密钥

// ✅ 正确示例
const key = randomBytes(32);  // 使用加密安全的随机数生成器
```

## 性能考虑

1. **缓存计算结果**
```typescript
const hashCache = new Map<string, string>();

function cachedHash(data: string): string {
  if (hashCache.has(data)) {
    return hashCache.get(data)!;
  }
  const hash = createHash('sha256').update(data).digest('hex');
  hashCache.set(data, hash);
  return hash;
}
```

2. **流式处理大文件**
```typescript
async function hashLargeFile(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  const stream = createReadStream(filePath);
  
  for await (const chunk of stream) {
    hash.update(chunk);
  }
  
  return hash.digest('hex');
}
```

## 实用工具函数集合

```typescript
// utils.ts
import { randomBytes, createHash, timingSafeEqual } from 'crypto';

export const CryptoUtils = {
  /**
   * 生成安全的随机字符串
   */
  generateRandomString(length: number): string {
    return randomBytes(Math.ceil(length / 2))
      .toString('hex')
      .slice(0, length);
  },

  /**
   * 生成安全的随机数字
   */
  generateRandomNumber(min: number, max: number): number {
    const range = max - min;
    const bytes = randomBytes(4);
    const value = bytes.readUInt32LE(0);
    return min + (value % range);
  },

  /**
   * 安全地比较两个字符串
   */
  safeCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    
    return bufA.length === bufB.length && 
           timingSafeEqual(bufA, bufB);
  },

  /**
   * 生成文件哈希
   */
  async generateFileHash(filePath: string): Promise<string> {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    
    for await (const chunk of stream) {
      hash.update(chunk);
    }
    
    return hash.digest('hex');
  }
};
```

## 结语

Node.js 的 crypto 模块提供了丰富的加密功能，但要安全地使用它们需要深入的理解和谨慎的实践。本教程涵盖了主要的使用场景和最佳实践，但加密技术在不断发展，建议：

1. 定期更新依赖
2. 关注安全公告
3. 进行安全审计
4. 使用自动化测试验证加密功能
5. 考虑使用专门的加密库处理特定需求

## 参考资源

1. [Node.js Crypto 文档](https://nodejs.org/api/crypto.html)
2. [OWASP 加密指南](https://owasp.org/www-project-cheat-sheets/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
3. [Web 加密 API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)

---

这个教程是否满足你的需求？如果需要更详细的解释或者其他示例，请告诉我。
