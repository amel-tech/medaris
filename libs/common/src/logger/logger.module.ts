import {
  type DynamicModule,
  Global,
  Module,
  type Provider,
} from "@nestjs/common";
import { LoggerFactory, type LoggerType } from "./logger.factory";
import type { LoggerConfig } from "./logger.interface";

export const LOGGER = "LOGGER";

@Global()
@Module({})
export class LoggerModule {
  static forRoot(type?: LoggerType, config?: LoggerConfig): DynamicModule {
    const loggerProvider: Provider = {
      provide: LOGGER,
      useFactory: () => {
        return LoggerFactory.create(type, config);
      },
    };

    return {
      module: LoggerModule,
      providers: [loggerProvider],
      exports: [loggerProvider],
    };
  }
}
