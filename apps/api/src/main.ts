import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureCors } from './cors';
import { configureSession } from './session';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureSession(app);
  configureCors(app);
  await app.listen(4000, '127.0.0.1');
}

void bootstrap();
