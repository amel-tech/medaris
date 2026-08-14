import "./load-env";
import "./otel";
import { applyGlobalMiddleware, LoggerFactory } from "@medaris/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";

async function bootstrap() {
  const logger = LoggerFactory.create();
  const app = await NestFactory.create(AppModule, {
    logger,
  });
  app.useLogger(logger);

  applyGlobalMiddleware(app, logger);

  const config = app.get(ConfigService);
  const port = config.get<number>("port") || 3001;
  // Swagger configuration
  const swaggerEnabled = config.get<boolean>("swagger.enabled");
  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .addBearerAuth()
      .addOAuth2(
        {
          type: "oauth2",
          flows: {
            implicit: {
              authorizationUrl: config
                .get<string>("KEYCLOAK_JWKS_URL")
                ?.replace("/certs", "/auth"),
              tokenUrl: config
                .get<string>("KEYCLOAK_JWKS_URL")
                ?.replace("/certs", "/token"),
              scopes: {},
            },
          },
        },
        "bearer"
      )
      .setTitle("Tedrisat Service API")
      .setDescription("Education management service for Madrasah platform")
      .setVersion(config.get<string>("version") || "1.0.0")
      .addTag("tedrisat", "Education management endpoints")
      .build();
    const swaggerEndpoint =
      config.get<string>("swagger.endpoint") || "/swagger";
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    app.use((req: any, res: any, next: any) => {
      if (
        req.url.startsWith(swaggerEndpoint) ||
        req.url.includes("oauth2-redirect.html")
      ) {
        res.removeHeader("Content-Security-Policy");
        res.removeHeader("cross-origin-opener-policy");
      }
      next();
    });
    SwaggerModule.setup(swaggerEndpoint, app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        oauth2RedirectUrl:
          config.get<string>("KEYCLOAK_REDIRECT_URL") +
          swaggerEndpoint +
          "/oauth2-redirect.html",
        initOAuth: {
          clientId: config.get<string>("KEYCLOAK_CLIENT_ID"),
          appName: "Ameltech Keycloak Login",
          usePkceWithAuthorizationCodeGrant: true,
        },
      },
    });
  }

  await app.listen(port);
  console.log(`Tedrisat service is running on port ${port}`);
}

void bootstrap();
