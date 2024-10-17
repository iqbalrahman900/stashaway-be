import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { DepositPlan } from './deposit-plan.entity';
import { Portfolio } from './portfolio.entity';
import { Deposit } from './deposit.entity';

@Entity()
export class PlanAllocation {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => DepositPlan, plan => plan.allocations)
  depositPlan: DepositPlan;

  @ManyToOne(() => Portfolio)
  portfolio: Portfolio;

  @ManyToOne(() => Deposit, deposit => deposit.allocations)
  deposit: Deposit;

  @Column('decimal', { precision: 10, scale: 2 })
  amount: number;
}