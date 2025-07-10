import {
    ExceptionFilter,
    HttpException,
    Catch,
    ArgumentsHost,
    HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { promises as fs } from 'fs';
import * as path from 'path';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter<unknown> {
    private readonly logDir = path.join(process.cwd(), 'logs');
    private readonly logFile = path.join(this.logDir, 'errors.json');

    private async ensureLogsDirectory() {
        try {
            await fs.mkdir(this.logDir, { recursive: true });
        } catch (err) {
            console.error('Cannot create logs directory:', err);
        }
    }

    private async logToJson(errorData: object) {
        try {
            await this.ensureLogsDirectory();

            let logs = [];
            try {
                const existing = await fs.readFile(this.logFile, 'utf-8');
                logs = JSON.parse(existing);
            } catch {
                // 文件不存在时跳过
            }

            (logs as object[]).push(errorData);
            await fs.writeFile(this.logFile, JSON.stringify(logs, null, 2), 'utf-8');
        } catch (err) {
            console.error('Failed to write JSON log:', err);
        }
    }

    catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();

        let status = HttpStatus.INTERNAL_SERVER_ERROR;
        let message = 'Internal server error';
        let errorDescription: string | undefined;
        let cause: unknown;
        let stack: string | undefined;

        if (exception instanceof HttpException) {
            status = exception.getStatus();
            const res = exception.getResponse();

            if (typeof res === 'string') {
                message = res;
            } else if (typeof res === 'object' && res !== null) {
                const obj = res as Record<string, any>;
                message = obj.message || message;
                errorDescription = obj.error;
            }

            const options = (exception as any).options;

            if (options?.cause) {
                cause = options.cause;
            }

            // 处理 cause，防止序列化时变成空对象
            cause = cause instanceof Error
                ? {
                    name: cause.name,
                    message: cause.message,
                    stack: cause.stack,
                }
                : cause;

            // 优先使用 HttpException 自带的完整 stack
            stack = exception.stack;
        } else if (exception instanceof Error) {
            message = exception.message;
            stack = exception.stack;
        }

        // fallback：如果没 stack，有 cause 且是字符串，则用 cause 作为简略堆栈信息
        if (!stack && typeof cause === 'string') {
            stack = cause;
        }

        const errorInfo = {
            timestamp: new Date().toISOString(),
            statusCode: status,
            path: request.url,
            method: request.method,
            message,
            error: errorDescription,
            cause,
            stack,
            context: {
                body: request.body,
                query: request.query,
                params: request.params,
                headers: {
                    'user-agent': request.headers['user-agent'],
                    referer: request.headers['referer'],
                },
            },
        };

        this.logToJson(errorInfo).catch(console.error);

        // 客户端响应
        response.status(status).json({
            statusCode: errorInfo.statusCode,
            success: false,
            timestamp: errorInfo.timestamp,
            path: errorInfo.path,
            message: errorInfo.message,
            ...(errorInfo.error && { error: errorInfo.error }),
            ...(process.env.NODE_ENV === 'dev' && { stack: errorInfo.stack }),
        });
    }
}
