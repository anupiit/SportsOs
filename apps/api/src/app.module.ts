import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { AchievementsModule } from './achievements/achievements.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { TasksModule } from './tasks/tasks.module';
import { InstitutionModule } from './institution/institution.module';
import { AiModule } from './ai/ai.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AttendanceModule } from './attendance/attendance.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { BookingsModule } from './bookings/bookings.module';
import { ClubsModule } from './clubs/clubs.module';
import { JwtAuthGuard, PermissionsGuard } from './common/guards';
import { AccountThrottlerGuard } from './common/throttler.guard';
import { ComplaintsModule } from './complaints/complaints.module';
import { FacilitiesModule } from './facilities/facilities.module';
import { HealthController } from './health/health.controller';
import { InventoryModule } from './inventory/inventory.module';
import { JobsModule } from './jobs/jobs.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { RbacModule } from './rbac/rbac.module';
import { TournamentsModule } from './tournaments/tournaments.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret || secret.length < 16) throw new Error('JWT_SECRET must be set to at least 16 characters');
        return { secret, signOptions: { expiresIn: config.get('JWT_EXPIRES_IN', '12h') } };
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuditModule,
    RbacModule,
    NotificationsModule,
    AuthModule,
    UsersModule,
    FacilitiesModule,
    BookingsModule,
    ClubsModule,
    AttendanceModule,
    InventoryModule,
    TournamentsModule,
    ComplaintsModule,
    AchievementsModule,
    AnalyticsModule,
    AiModule,
    JobsModule,
    AnnouncementsModule,
    TasksModule,
    InstitutionModule,
  ],
  controllers: [HealthController],
  providers: [
    // order matters: authenticate → rate limit (per account) → authorise
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: AccountThrottlerGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
