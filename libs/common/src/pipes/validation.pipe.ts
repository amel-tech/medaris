import {
  PipeTransform,
  ValidationError,
  ValidationPipe,
  ValidationPipeOptions,
} from "@nestjs/common";
import { ValidationError as MedarisValidationError } from "../error";

export class MedarisValidationPipe
  extends ValidationPipe
  implements PipeTransform<any, any>
{
  constructor(opts: ValidationPipeOptions = {}) {
    const defaultOptions: ValidationPipeOptions = {
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors: ValidationError[]) => {
        // `value` is deliberately not mapped: it is the raw submitted input,
        // and the filter serialises this context straight into the response
        // body, so a password or a token pasted into the wrong field would be
        // echoed back to the browser (MDRS-29).
        const validationErrors = errors.map((e) => ({
          property: e.property,
          constraints: e.constraints,
        }));

        const propertyNames = errors.map((e) => e.property).join(", ");
        const errorMessage = `Validation error for properties: ${propertyNames}`;

        throw new MedarisValidationError(errorMessage, {
          errors: validationErrors,
        });
      },
    };

    super({
      ...defaultOptions,
      ...opts,
    });
  }
}
