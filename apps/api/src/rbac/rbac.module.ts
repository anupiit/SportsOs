import { Global, Module } from '@nestjs/common';
import { RbacController } from './rbac.controller';
import { RbacService } from './rbac.service';
import { RoleAssignmentsService } from './role-assignments.service';

@Global()
@Module({
  controllers: [RbacController],
  providers: [RbacService, RoleAssignmentsService],
  exports: [RbacService, RoleAssignmentsService],
})
export class RbacModule {}
