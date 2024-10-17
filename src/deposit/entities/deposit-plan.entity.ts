import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { PlanAllocation } from './plan-allocation.entity';

@Entity()
export class DepositPlan {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  type: 'one-time' | 'monthly';

  @OneToMany(() => PlanAllocation, allocation => allocation.depositPlan, { cascade: true })
  allocations: PlanAllocation[];

  @Column({ nullable: true })
  executionDate?: Date;

  @Column({ default: true })
  isActive: boolean;
}