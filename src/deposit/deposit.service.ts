import { Injectable, Logger, NotFoundException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Connection } from 'typeorm';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Portfolio } from './entities/portfolio.entity';
import { DepositPlan } from './entities/deposit-plan.entity';
import { PlanAllocation } from './entities/plan-allocation.entity';
import { Deposit } from './entities/deposit.entity';
import { ActivityLog } from './schemas/activity-log.schema';
import { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';

@Injectable()
export class DepositService {
  private readonly logger = new Logger(DepositService.name);

  constructor(
    
    @InjectRepository(Portfolio)
    private portfolioRepository: Repository<Portfolio>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    @InjectRepository(DepositPlan)
    private depositPlanRepository: Repository<DepositPlan>,
    @InjectRepository(PlanAllocation)
    private planAllocationRepository: Repository<PlanAllocation>,
    @InjectRepository(Deposit)
    private depositRepository: Repository<Deposit>,
    @InjectModel(ActivityLog.name)
    private activityLogModel: Model<ActivityLog>,
    private connection: Connection
  ) {}

  async allocateDeposits(deposits: Deposit[]): Promise<Map<string, number>> {
    const queryRunner = this.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
  
    try {
      const allocation = new Map<string, number>();
      let remainingFunds = deposits.reduce((sum, deposit) => sum + deposit.amount, 0);
  
      const plans = await queryRunner.manager.find(DepositPlan, {
        where: { isActive: true },
        relations: ['allocations', 'allocations.portfolio'],
        order: { type: 'ASC' } 
      });
  
      for (const plan of plans) {
        for (const planAllocation of plan.allocations) {
          const allocationAmount = Math.min(planAllocation.amount, remainingFunds);
          if (allocationAmount > 0) {
            this.updateAllocationPrivate(allocation, planAllocation.portfolio.name, allocationAmount);
            remainingFunds -= allocationAmount;
  
         
            planAllocation.portfolio.balance += allocationAmount;
            await queryRunner.manager.save(Portfolio, planAllocation.portfolio);
          }
        }
  
        if (plan.type === 'one-time') {
          plan.isActive = false;
          await queryRunner.manager.save(DepositPlan, plan);
        }
  
        if (remainingFunds <= 0) break;
      }
  
     
      if (remainingFunds > 0) {
        const firstPortfolio = await queryRunner.manager.findOne(Portfolio, {});
        if (firstPortfolio) {
          this.updateAllocationPrivate(allocation, firstPortfolio.name, remainingFunds);
          firstPortfolio.balance += remainingFunds;
          await queryRunner.manager.save(Portfolio, firstPortfolio);
        } else {
          throw new Error('No portfolios available for allocation');
        }
      }
  
      await queryRunner.commitTransaction();
      return allocation;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to allocate deposits: ${error.message}`, error.stack);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async createDepositPlan(planData: {
    type: 'one-time' | 'monthly';
    allocations: { portfolioId: number; amount: number }[];
  }): Promise<DepositPlan> {
    const queryRunner = this.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
  
    try {
      const plan = new DepositPlan();
      plan.type = planData.type;
      plan.isActive = true;
  
      const savedPlan = await queryRunner.manager.save(DepositPlan, plan);
  
      for (const allocation of planData.allocations) {
        const portfolio = await queryRunner.manager.findOne(Portfolio, { where: { id: allocation.portfolioId } });
        if (!portfolio) {
          throw new NotFoundException(`Portfolio with id ${allocation.portfolioId} not found`);
        }
  
        const planAllocation = new PlanAllocation();
        planAllocation.depositPlan = savedPlan;
        planAllocation.portfolio = portfolio;
        planAllocation.amount = allocation.amount;
  
        await queryRunner.manager.save(PlanAllocation, planAllocation);
      }
  
      await queryRunner.commitTransaction();
      await this.cacheManager.del('activeDepositPlans'); // Invalidate cache
      return savedPlan;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async getActiveDepositPlans(): Promise<DepositPlan[]> {
    const cachedPlans = await this.cacheManager.get<DepositPlan[]>('activeDepositPlans');
    if (cachedPlans) {
      return cachedPlans;
    }
  
    const activePlans = await this.depositPlanRepository.find({
      where: { isActive: true },
      relations: ['allocations', 'allocations.portfolio'],
      order: { type: 'ASC' }
    });
  
    await this.cacheManager.set('activeDepositPlans', activePlans, 1800000); // Cache for 30 minutes
    return activePlans;
  }

  async createDeposit(deposit: Partial<Deposit>): Promise<Deposit> {
    const queryRunner = this.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const newDeposit = this.depositRepository.create({
        ...deposit,
        timestamp: new Date(),
      });
  
      const savedDeposit = await queryRunner.manager.save(Deposit, newDeposit);
      await this.logActivityPrivate(`Deposit created: ${JSON.stringify(savedDeposit)}`);

      await queryRunner.commitTransaction();
      return savedDeposit;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to create deposit: ${error.message}`, error.stack);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async createPortfolio(portfolio: Partial<Portfolio>): Promise<Portfolio> {
    const queryRunner = this.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
  
    try {
      let existingPortfolio = await queryRunner.manager.findOne(Portfolio, { where: { name: portfolio.name } });
      if (existingPortfolio) {
        existingPortfolio.balance = portfolio.balance ?? existingPortfolio.balance;
        existingPortfolio = await queryRunner.manager.save(Portfolio, existingPortfolio);
      } else {
        const newPortfolio = this.portfolioRepository.create(portfolio);
        existingPortfolio = await queryRunner.manager.save(Portfolio, newPortfolio);
      }
  
      await queryRunner.commitTransaction();
      await this.cacheManager.del('portfolios');
      return existingPortfolio;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async getPortfolios(): Promise<Portfolio[]> {
    const cachedPortfolios = await this.cacheManager.get<Portfolio[]>('portfolios');
    if (cachedPortfolios) {
      return cachedPortfolios;
    }
    const portfolios = await this.portfolioRepository.find();
    await this.cacheManager.set('portfolios', portfolios, 3600000); // 1 hour in milliseconds
    return portfolios;
  }



  async getDepositPlans(): Promise<DepositPlan[]> {
    return this.depositPlanRepository.find({ relations: ['allocations', 'allocations.portfolio'] });
  }

  async getDeposits(): Promise<Deposit[]> {
    return this.depositRepository.find();
  }

  async getDepositPlanHistory(planId: number): Promise<any> {
    const plan = await this.depositPlanRepository.findOne({
      where: { id: planId },
      relations: ['allocations', 'allocations.portfolio']
    });

    if (!plan) {
      throw new NotFoundException(`Deposit plan with ID ${planId} not found`);
    }

    const activities = await this.activityLogModel.find({
      activity: { $regex: `Deposit plan ${planId}` }
    }).sort({ timestamp: -1 });

    return {
      plan,
      executionHistory: activities
    };
  }

  private updateAllocationPrivate(allocation: Map<string, number>, portfolioName: string, amount: number): void {
    allocation.set(portfolioName, (allocation.get(portfolioName) || 0) + amount);
  }

  private async getPortfolioPrivate(id: number, manager): Promise<Portfolio | undefined> {
    return manager.findOne(Portfolio, { where: { id } });
  }

  private async logActivityPrivate(activity: string): Promise<void> {
    try {
      await this.activityLogModel.create({ activity, timestamp: new Date() });
    } catch (error) {
      this.logger.error(`Failed to log activity: ${activity}`, error.stack);
    }
  }

  async rollbackLastDeposit(referenceCode: string): Promise<void> {
    const queryRunner = this.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
  
    try {
      const deposit = await queryRunner.manager.findOne(Deposit, {
        where: { referenceCode },
        relations: ['allocations', 'allocations.portfolio'],
        order: { timestamp: 'DESC' },
      });
  
      if (!deposit) {
        throw new NotFoundException(`No deposit found with reference code ${referenceCode}`);
      }
  
   
      for (const allocation of deposit.allocations) {
        allocation.portfolio.balance -= allocation.amount;
        await queryRunner.manager.save(Portfolio, allocation.portfolio);
      }
  
   
      await queryRunner.manager.remove(PlanAllocation, deposit.allocations);
  

      await queryRunner.manager.remove(Deposit, deposit);
  
      await queryRunner.commitTransaction();
      await this.cacheManager.del('portfolios');  // Make sure this line is present
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  
}