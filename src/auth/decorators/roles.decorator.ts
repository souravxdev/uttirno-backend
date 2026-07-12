import { SetMetadata } from '@nestjs/common';
import { Role } from '../../generated/prisma/enums';

export const ROLES_KEY = 'roles';

/** Restrict a route/controller to the given roles. Combine with JwtAuthGuard + RolesGuard. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
