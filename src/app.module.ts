import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MongooseModule } from '@nestjs/mongoose';
import { DepositModule } from './deposit/deposit.module';
import { Portfolio } from './deposit/entities/portfolio.entity';
import { DepositPlan } from './deposit/entities/deposit-plan.entity';
import { Deposit } from './deposit/entities/deposit.entity';
import { PlanAllocation } from './deposit/entities/plan-allocation.entity';
import { CacheModule } from './cache.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: 'localhost',
      port: 3306,
      username: 'root',
      password: '123456',
      database: 'stashaway',
      entities: [Portfolio, DepositPlan, Deposit, PlanAllocation],
      synchronize: true,
    }),
    MongooseModule.forRoot('mongodb://localhost/stashaway'),
    CacheModule,
    DepositModule,
  ],
})
export class AppModule {}