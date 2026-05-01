import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import { json, urlencoded } from 'body-parser';
import { basename, extname, join } from 'path';
import * as express from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());

  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));

  app.enableCors({
    origin: process.env.FRONTEND_URL_ONLY || 'http://localhost:3000',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  app.use(
    '/uploads',
    express.static(join(__dirname, '..', 'uploads'), {
      setHeaders: (res, filePath) => {
        const fileName = basename(filePath);
        const ext = extname(filePath).toLowerCase();

        let contentType = 'application/octet-stream';
        switch (ext) {
          case '.pdf':
            contentType = 'application/pdf';
            break;
          case '.jpg':
          case '.jpeg':
            contentType = 'image/jpeg';
            break;
          case '.png':
            contentType = 'image/png';
            break;
          case '.svg':
            contentType = 'image/svg+xml';
            break;
          case '.webp':
            contentType = 'image/webp';
            break;
          case '.gif':
            contentType = 'image/gif';
            break;
          case '.txt':
            contentType = 'text/plain';
            break;
          case '.doc':
            contentType = 'application/msword';
            break;
          case '.docx':
            contentType =
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
            break;
        }

        const isInline = res.req.query.inline === 'true';
        res.setHeader(
          'Content-Disposition',
          isInline
            ? `inline; filename="${fileName}"`
            : `attachment; filename="${fileName}"`,
        );
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=31536000');
        res.setHeader(
          'Content-Security-Policy',
          "default-src 'self' data:; img-src 'self' data:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';",
        );
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        res.setHeader(
          'Access-Control-Allow-Origin',
          process.env.FRONTEND_URL || 'http://localhost:3000',
        );
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      },
    }),
  );

  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
