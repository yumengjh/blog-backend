import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
// import { join } from 'path';
// import * as express from 'express';

let cachedApp: INestApplication;


export async function bootstrap(): Promise<INestApplication> {
  if (!cachedApp) {
    const app = await NestFactory.create(AppModule);

    // 启用代理信任，以便正确解析 Vercel 转发的 IP
    app.getHttpAdapter().getInstance().set('trust proxy', 1);


    // 启用 CORS
    app.enableCors({
      origin: true,
      credentials: true,
    });

    // 设置全局 ValidationPipe，开启白名单过滤和禁止非白名单属性
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,  // 只允许白名单属性
      forbidNonWhitelisted: true, // 禁止非白名单属性
      forbidUnknownValues: true, // 禁止未知值
      transform: true, // 允许类型自动转换(装饰器标记)
      transformOptions: {
        enableImplicitConversion: true, // 启用隐式类型转换(允许不写 显式装饰器 也能根据类型推断自动转换)
      },
    }));



    // 修复：INestApplication 没有 disable 方法，需通过 Express 实例关闭 x-powered-by
    // const expressApp = app.getHttpAdapter().getInstance();
    // expressApp.disable('x-powered-by');

    // 静态资源 gzip 支持
    // app.use('/assets', (req, res, next) => {
    //   if (req.url.endsWith('.gz')) {
    //     // 设置正确的 Content-Encoding
    //     res.set('Content-Encoding', 'gzip');
    //     // 根据文件类型设置 Content-Type
    //     if (req.url.endsWith('.js.gz')) {
    //       res.set('Content-Type', 'application/javascript');
    //     } else if (req.url.endsWith('.css.gz')) {
    //       res.set('Content-Type', 'text/css');
    //     } else if (req.url.endsWith('.json.gz')) {
    //       res.set('Content-Type', 'application/json');
    //     }
    //     // 你可以根据需要添加更多类型
    //   }
    //   next();
    // });
    // app.use('/assets', express.static(join(__dirname, '..', 'public/assets')));

    // 初始化应用，确保所有模块、依赖注入容器和生命周期钩子都已正确设置
    // 这一步对于确保应用在 Vercel 环境下正常工作至关重要
    await app.init();
    cachedApp = app;
  }
  return cachedApp;
}

// 如果不是在 Vercel 环境下（即本地运行），就执行监听端口
if (!process.env.VERCEL) {
  bootstrap().then(app => {
    const port = process.env.PORT || 3000;
    app.listen(port, () => {
      console.log(`🚀 Local server listening on http://localhost:${port}`);
    });
  });
}

// 如果是 Vercel，则导出 handler
export default async function handler(req, res) {
  const app = await bootstrap();
  const httpAdapter = app.getHttpAdapter();
  return httpAdapter.getInstance()(req, res);
}