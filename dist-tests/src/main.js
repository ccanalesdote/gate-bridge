import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
async function bootstrap() {
    const app = await NestFactory.createApplicationContext(AppModule);
    app.enableShutdownHooks();
}
void bootstrap();
