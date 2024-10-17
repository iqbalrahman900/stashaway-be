import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany } from 'typeorm';
import { PlanAllocation } from './plan-allocation.entity';

@Entity()
export class Deposit {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('decimal', { precision: 10, scale: 2 })
  amount: number;

  @Column()
  referenceCode: string;

  @CreateDateColumn()
  timestamp: Date;

  @OneToMany(() => PlanAllocation, allocation => allocation.deposit)
  allocations: PlanAllocation[];
}