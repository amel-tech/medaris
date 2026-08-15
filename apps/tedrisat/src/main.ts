import "./otel";
import { applyGlobalMiddleware, LoggerFactory } from "@medaris/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import {
  endpointPrefixOf,
  SWAGGER_OAUTH2_REDIRECT_SEGMENT,
  type SwaggerCspRequest,
  shouldRelaxSwaggerHeaders,
} from "./config/swagger-csp";
import { resolveSwaggerOauthRedirectOrigin } from "./config/swagger-env";

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
    // Normalised once, then used for all three consumers below — the mount
    // path, the predicate and the OAuth2 redirect URL. That last one
    // concatenates the endpoint onto an origin, so an unslashed
    // `SWAGGER_PATH=docs` (the form the workspace-root .env.example ships)
    // would otherwise build `https://hostdocs/oauth2-redirect.html`.
    const swaggerEndpoint = endpointPrefixOf(
      config.get<string>("swagger.endpoint") || "/swagger"
    );
    // The other half of that concatenation. KEYCLOAK_REDIRECT_URL is in no
    // schema, so an absent value used to stringify into
    // `undefined/docs/oauth2-redirect.html` — see config/swagger-env.ts.
    const oauthRedirectOrigin = resolveSwaggerOauthRedirectOrigin();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    // helmet() already ran for every route in applyGlobalMiddleware above, so
    // the two headers can only be taken back off here. The predicate matches
    // on the pathname — see config/swagger-csp.ts.
    app.use(
      (
        req: SwaggerCspRequest,
        res: { removeHeader: (name: string) => void },
        next: () => void
      ) => {
        if (shouldRelaxSwaggerHeaders(req, swaggerEndpoint)) {
          res.removeHeader("Content-Security-Policy");
          res.removeHeader("cross-origin-opener-policy");
        }
        next();
      }
    );
    SwaggerModule.setup(swaggerEndpoint || "/", app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        oauth2RedirectUrl: `${oauthRedirectOrigin}${swaggerEndpoint}/${SWAGGER_OAUTH2_REDIRECT_SEGMENT}`,
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
