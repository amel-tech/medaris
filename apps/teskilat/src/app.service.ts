import { HealthCheckDto, ILogger, LOGGER } from "@medaris/common";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class AppService {
  // ConfigService must stay a value import: an `import type` erases it from
  // design:paramtypes and Nest can no longer inject it.
  constructor(
    @Inject(LOGGER) private readonly logger: ILogger,
    private readonly config: ConfigService
  ) {
    this.logger.setContext("AppService");
  }

  getHello(): string {
    this.logger.log("getHello called");
    return "Teşkilat Hizmetinden Selamun Aleyküm!";
  }

  /**
   * Every field comes from the configuration factory, never from a literal
   * (MDRS-129): the environment used to be a hardcoded development literal, so a
   * production container reported itself as a development one.
   */
  getHealth(): HealthCheckDto {
    this.logger.log("Health check requested");
    return new HealthCheckDto(
      this.config.getOrThrow<string>("serviceName"),
      "ok",
      this.config.getOrThrow<string>("version"),
      this.config.getOrThrow<string>("environment")
    );
  }
}
