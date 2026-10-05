import { AuthzPublic, HealthCheckDto } from "@medaris/common";
import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { AppService } from "./app.service";

// No guard on this controller, so `@AuthzPublic()` below changes nothing
// today. It is the explicit, greppable exemption MDRS-44 needs when it flips
// the guard to closed-by-default: a load balancer probes `/health` with no
// token and must keep getting 200.
@ApiTags("Tedrisat Service")
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @AuthzPublic()
  @Get()
  @ApiOperation({
    summary: "Get hello message",
    description: "Returns a greeting message from the Tedrisat service",
    operationId: "getHello",
  })
  @ApiResponse({
    status: 200,
    description: "Greeting message",
    type: String,
  })
  getHello(): string {
    return this.appService.getHello();
  }

  @AuthzPublic()
  @Get("health")
  @ApiOperation({
    summary: "Health check",
    description: "Returns the health status of the Tedrisat service",
    operationId: "getHealth",
  })
  @ApiResponse({
    status: 200,
    description: "Service health information",
    type: HealthCheckDto,
  })
  getHealth(): HealthCheckDto {
    return this.appService.getHealth();
  }
}
