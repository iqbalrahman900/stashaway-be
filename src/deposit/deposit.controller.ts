import { Controller, Post, Body, Get, Logger, ParseIntPipe, Param, NotFoundException, HttpStatus, HttpCode } from '@nestjs/common';
import { DepositService } from './deposit.service';
import { DepositPlan } from './entities/deposit-plan.entity';
import { Deposit } from './entities/deposit.entity';
import { Portfolio } from './entities/portfolio.entity';

@Controller('deposits')
export class DepositController {
  private readonly logger = new Logger(DepositController.name);

  constructor(private readonly depositService: DepositService) {}

  @Post('allocate')
  async allocateDeposits(@Body('deposits') deposits: Deposit[]) {
    this.logger.log(`Received request to allocate deposits: ${JSON.stringify({ deposits })}`);
    try {
      const allocation = await this.depositService.allocateDeposits(deposits);
      this.logger.log(`Successfully allocated deposits: ${JSON.stringify(Object.fromEntries(allocation))}`);
      return {
        success: true,
        allocation: Object.fromEntries(allocation)
      };
    } catch (error) {
      this.logger.error(`Failed to allocate deposits: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Post('create-portfolio')
  async createPortfolio(@Body() portfolio: Portfolio) {
    this.logger.log(`Received request to create portfolio: ${JSON.stringify(portfolio)}`);
    try {
      const createdPortfolio = await this.depositService.createPortfolio(portfolio);
      this.logger.log(`Successfully created portfolio: ${JSON.stringify(createdPortfolio)}`);
      return {
        success: true,
        portfolio: createdPortfolio
      };
    } catch (error) {
      this.logger.error(`Failed to create portfolio: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get('portfolios')
  async getPortfolios() {
    this.logger.log('Received request to get all portfolios');
    try {
      const portfolios = await this.depositService.getPortfolios();
      this.logger.log(`Successfully retrieved ${portfolios.length} portfolios`);
      return {
        success: true,
        portfolios
      };
    } catch (error) {
      this.logger.error(`Failed to get portfolios: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Post('create-plan')
  async createDepositPlan(@Body() depositPlan: any) {
    this.logger.log(`Received request to create deposit plan: ${JSON.stringify(depositPlan)}`);
    try {
      const createdPlan = await this.depositService.createDepositPlan(depositPlan);
      this.logger.log(`Successfully created deposit plan: ${JSON.stringify(createdPlan)}`);
      return {
        success: true,
        plan: createdPlan
      };
    } catch (error) {
      this.logger.error(`Failed to create deposit plan: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get('plan-history/:id')
  async getDepositPlanHistory(@Param('id', ParseIntPipe) id: number) {
    try {
      return await this.depositService.getDepositPlanHistory(id);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error('An error occurred while fetching deposit plan history');
    }
  }


  @Post('create-deposit')
  async createDeposit(@Body() deposit: Partial<Deposit>) {
    this.logger.log(`Received request to create deposit: ${JSON.stringify(deposit)}`);
    try {
      const createdDeposit = await this.depositService.createDeposit(deposit);
      this.logger.log(`Successfully created deposit: ${JSON.stringify(createdDeposit)}`);
      return {
        success: true,
        deposit: createdDeposit
      };
    } catch (error) {
      this.logger.error(`Failed to create deposit: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Get('active-plans')
  async getActivePlans() {
    this.logger.log('Received request to get active deposit plans');
    try {
      const activePlans = await this.depositService.getActiveDepositPlans();
      this.logger.log(`Successfully retrieved ${activePlans.length} active plans`);
      return {
        success: true,
        plans: activePlans
      };
    } catch (error) {
      this.logger.error(`Failed to get active deposit plans: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Post('rollback/:referenceCode')
  @HttpCode(HttpStatus.OK)
  async rollbackDeposit(@Param('referenceCode') referenceCode: string) {
    await this.depositService.rollbackLastDeposit(referenceCode);
    return { message: `Successfully rolled back deposit with reference code ${referenceCode}` };
  }

  @Get()
  async getAllDeposits() {
    this.logger.log('Received request to get all deposits');
    try {
      const deposits = await this.depositService.getDeposits();
      this.logger.log(`Successfully retrieved ${deposits.length} deposits`);
      return {
        success: true,
        deposits
      };
    } catch (error) {
      this.logger.error(`Failed to get deposits: ${error.message}`, error.stack);
      throw error;
    }
  }
  

  
}