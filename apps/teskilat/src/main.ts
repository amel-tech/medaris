import "./load-env";
import "./otel";
import { applyGlobalMiddleware, LoggerFactory } from "@medaris/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { mountSwagger } from "./swagger";

async function bootstrap() {
  const logger = LoggerFactory.create();
  const app = await NestFactory.create(AppModule, {
    logger,
  });
  app.useLogger(logger);

  applyGlobalMiddleware(app, logger);

  const config = app.get(ConfigService);

  // Never mounts under NODE_ENV=production, which apps/teskilat/Dockerfile
  // pins — see config/swagger-env.ts.
  mountSwagger(app, config, logger);

  const port = config.get<number>("port") || 3002;

  await app.listen(port);
  console.log(`Teskilat service is running on port ${port}`);
}

void bootstrap();
