// deposit/entities/portfolio.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { PlanAllocation } from './plan-allocation.entity';

@Entity()
export class Portfolio {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column('decimal', { precision: 10, scale: 2, default: 0, transformer: {
    to: (value: number) => value,
    from: (value: string) => parseFloat(value)
  }})
  balance: number;

  @OneToMany(() => PlanAllocation, allocation => allocation.portfolio)
  allocations: PlanAllocation[];
}