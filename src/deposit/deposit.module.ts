import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MongooseModule } from '@nestjs/mongoose';
import { DepositService } from './deposit.service';
import { DepositController } from './deposit.controller';
import { Portfolio } from './entities/portfolio.entity';
import { DepositPlan } from './entities/deposit-plan.entity';
import { Deposit } from './entities/deposit.entity';
import { PlanAllocation } from './entities/plan-allocation.entity';
import { ActivityLog, ActivityLogSchema } from './schemas/activity-log.schema';
import { CacheModule } from '../cache.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Portfolio, DepositPlan, Deposit, PlanAllocation]),
    MongooseModule.forFeature([{ name: ActivityLog.name, schema: ActivityLogSchema }]),
    CacheModule,
  ],
  providers: [DepositService],
  controllers: [DepositController],
})
export class DepositModule {}