import {
  PipeTransform,
  ValidationError,
  ValidationPipe,
  ValidationPipeOptions,
} from "@nestjs/common";
import { ValidationError as MedarisValidationError } from "../error";

interface FlatValidationError {
  property: string;
  constraints?: Record<string, string>;
}

/**
 * `errors` is a tree: a `@ValidateNested` failure carries no `constraints` of
 * its own, only `children` holding the actual violations one level down. This
 * walks it into a flat, dotted-path list so a nested failure (e.g.
 * `weeks[0].lessons[0].title`) still reports its constraints instead of
 * serialising to a bare `{ property: "weeks" }` (MDRS-29 follow-up).
 */
function flattenValidationErrors(
  errors: ValidationError[],
  prefix = ""
): FlatValidationError[] {
  return errors.flatMap((e) => {
    const property = prefix ? `${prefix}.${e.property}` : e.property;
    if (e.constraints) return [{ property, constraints: e.constraints }];
    if (e.children?.length)
      return flattenValidationErrors(e.children, property);
    return [{ property }];
  });
}

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
        const validationErrors = flattenValidationErrors(errors);

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
