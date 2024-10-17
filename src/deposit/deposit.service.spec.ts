import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Connection } from 'typeorm';
import { DepositService } from './deposit.service';
import { Portfolio } from './entities/portfolio.entity';
import { DepositPlan } from './entities/deposit-plan.entity';
import { PlanAllocation } from './entities/plan-allocation.entity';
import { Deposit } from './entities/deposit.entity';
import { ActivityLog } from './schemas/activity-log.schema';
import { NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

describe('DepositService', () => {
  let service: DepositService;
  let mockPortfolioRepository;
  let mockDepositPlanRepository;
  let mockPlanAllocationRepository;
  let mockDepositRepository;
  let mockActivityLogModel;
  let mockConnection;
  let mockCacheManager;

  beforeEach(async () => {
    mockPortfolioRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    mockDepositPlanRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    mockPlanAllocationRepository = {
      create: jest.fn(),
      save: jest.fn(),
    };
    mockDepositRepository = {
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    mockActivityLogModel = {
      create: jest.fn(),
      find: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
    };
    mockConnection = {
      createQueryRunner: jest.fn().mockReturnValue({
        connect: jest.fn(),
        startTransaction: jest.fn(),
        manager: {
          find: jest.fn(),
          findOne: jest.fn(),
          save: jest.fn(),
          remove: jest.fn(),
        },
        commitTransaction: jest.fn(),
        rollbackTransaction: jest.fn(),
        release: jest.fn(),
      }),
    };
    mockCacheManager = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DepositService,
        { provide: getRepositoryToken(Portfolio), useValue: mockPortfolioRepository },
        { provide: getRepositoryToken(DepositPlan), useValue: mockDepositPlanRepository },
        { provide: getRepositoryToken(PlanAllocation), useValue: mockPlanAllocationRepository },
        { provide: getRepositoryToken(Deposit), useValue: mockDepositRepository },
        { provide: 'ActivityLogModel', useValue: mockActivityLogModel },
        { provide: Connection, useValue: mockConnection },
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
      ],
    }).compile();

    service = module.get<DepositService>(DepositService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('allocateDeposits', () => {
    it('should allocate deposits correctly', async () => {
        const deposits: Partial<Deposit>[] = [
          { amount: 10500, referenceCode: 'DEP001' },
          { amount: 100, referenceCode: 'DEP002' }
        ];
        const plans = [
          {
            id: 1,
            type: 'one-time',
            isActive: true,
            allocations: [
              { portfolio: { id: 1, name: 'High Risk', balance: 0 }, amount: 10000 },
              { portfolio: { id: 2, name: 'Retirement', balance: 0 }, amount: 500 },
            ],
          },
          {
            id: 2,
            type: 'monthly',
            isActive: true,
            allocations: [
              { portfolio: { id: 1, name: 'High Risk', balance: 0 }, amount: 0 },
              { portfolio: { id: 2, name: 'Retirement', balance: 0 }, amount: 100 },
            ],
          },
        ];
      
        mockConnection.createQueryRunner().manager.find.mockResolvedValue(plans);
        mockConnection.createQueryRunner().manager.findOne.mockResolvedValue({ id: 1, name: 'High Risk', balance: 0 });
      
        const result = await service.allocateDeposits(deposits as Deposit[]);
      
        expect(result.get('High Risk')).toBe(10000);
        expect(result.get('Retirement')).toBe(600);
        expect(mockConnection.createQueryRunner().commitTransaction).toHaveBeenCalled();
        expect(mockCacheManager.del).toHaveBeenCalledWith('portfolios');
      });

    it('should throw an error if no portfolios are available', async () => {
      const deposits: Partial<Deposit>[] = [{ amount: 100, referenceCode: 'DEP003' }];
      mockConnection.createQueryRunner().manager.find.mockResolvedValue([]);
      mockConnection.createQueryRunner().manager.findOne.mockResolvedValue(null);

      await expect(service.allocateDeposits(deposits as Deposit[])).rejects.toThrow('No portfolios available for allocation');
      expect(mockConnection.createQueryRunner().rollbackTransaction).toHaveBeenCalled();
    });
  });

  describe('createDepositPlan', () => {
    it('should create a deposit plan successfully', async () => {
      const planData = {
        type: 'one-time' as const,
        allocations: [
          { portfolioId: 1, amount: 1000 },
          { portfolioId: 2, amount: 500 },
        ],
      };
  
      const mockPortfolio1 = { id: 1, name: 'Portfolio 1', balance: 0 };
      const mockPortfolio2 = { id: 2, name: 'Portfolio 2', balance: 0 };
  
      mockConnection.createQueryRunner().manager.findOne
        .mockResolvedValueOnce(mockPortfolio1)
        .mockResolvedValueOnce(mockPortfolio2);
  
      const mockSavedPlan = { id: 1, type: 'one-time', isActive: true };
      mockConnection.createQueryRunner().manager.save
        .mockResolvedValueOnce(mockSavedPlan)
        .mockResolvedValue({});  // For PlanAllocation saves
  
      const result = await service.createDepositPlan(planData);
  
      expect(result).toEqual(mockSavedPlan);
      expect(mockConnection.createQueryRunner().commitTransaction).toHaveBeenCalled();
      expect(mockCacheManager.del).toHaveBeenCalledWith('activeDepositPlans');
    });

  });

  describe('getActiveDepositPlans', () => {
    it('should return active deposit plans and cache them', async () => {
      const activePlans = [
        { id: 1, type: 'one-time', isActive: true },
        { id: 2, type: 'monthly', isActive: true },
      ];
   
      mockCacheManager.get.mockResolvedValue(null);
      

      mockDepositPlanRepository.find.mockResolvedValue(activePlans);
  
      const result = await service.getActiveDepositPlans();
  
      expect(result).toEqual(activePlans);
      expect(mockDepositPlanRepository.find).toHaveBeenCalledWith({
        where: { isActive: true },
        relations: ['allocations', 'allocations.portfolio'],
        order: { type: 'ASC' },
      });
      expect(mockCacheManager.set).toHaveBeenCalledWith('activeDepositPlans', activePlans, 1800000);
    });
  
    it('should return cached active deposit plans if available', async () => {
      const cachedPlans = [
        { id: 1, type: 'one-time', isActive: true },
        { id: 2, type: 'monthly', isActive: true },
      ];
 
      mockCacheManager.get.mockResolvedValue(cachedPlans);
  
      const result = await service.getActiveDepositPlans();
  
      expect(result).toEqual(cachedPlans);
      expect(mockDepositPlanRepository.find).not.toHaveBeenCalled();
      expect(mockCacheManager.set).not.toHaveBeenCalled();
    });
  });

  describe('createDeposit', () => {
    it('should create a deposit successfully', async () => {
      const depositData = { amount: 1000, referenceCode: 'DEP001' };
      const createdDeposit = { ...depositData, id: 1, timestamp: new Date() };
      
      mockConnection.createQueryRunner().manager.save.mockResolvedValue(createdDeposit);

      const result = await service.createDeposit(depositData);

      expect(result).toEqual(createdDeposit);
      expect(mockConnection.createQueryRunner().commitTransaction).toHaveBeenCalled();
    });

    it('should rollback transaction if error occurs', async () => {
      const depositData = { amount: 1000, referenceCode: 'DEP001' };
      
      mockConnection.createQueryRunner().manager.save.mockRejectedValue(new Error('Database error'));

      await expect(service.createDeposit(depositData)).rejects.toThrow('Database error');
      expect(mockConnection.createQueryRunner().rollbackTransaction).toHaveBeenCalled();
    });
  });

  describe('createPortfolio', () => {
    it('should create a new portfolio if it does not exist', async () => {
      const portfolioData = { name: 'New Portfolio', balance: 0 };
      const createdPortfolio = { id: 1, ...portfolioData };
  
      mockConnection.createQueryRunner().manager.findOne.mockResolvedValue(null);
      mockConnection.createQueryRunner().manager.save.mockResolvedValue(createdPortfolio);
  
      const result = await service.createPortfolio(portfolioData);
  
      expect(result).toEqual(createdPortfolio);
      expect(mockConnection.createQueryRunner().commitTransaction).toHaveBeenCalled();
      expect(mockCacheManager.del).toHaveBeenCalledWith('portfolios');
    });
  
    it('should update existing portfolio if it exists', async () => {
      const portfolioData = { name: 'Existing Portfolio', balance: 1000 };
      const existingPortfolio = { id: 1, name: 'Existing Portfolio', balance: 500 };
      const updatedPortfolio = { ...existingPortfolio, balance: 1000 };
  
      mockConnection.createQueryRunner().manager.findOne.mockResolvedValue(existingPortfolio);
      mockConnection.createQueryRunner().manager.save.mockResolvedValue(updatedPortfolio);
  
      const result = await service.createPortfolio(portfolioData);
  
      expect(result).toEqual(updatedPortfolio);
      expect(mockConnection.createQueryRunner().commitTransaction).toHaveBeenCalled();
      expect(mockCacheManager.del).toHaveBeenCalledWith('portfolios');
    });
  });

  describe('getDepositPlanHistory', () => {
    it('should return deposit plan history', async () => {
      const planId = 1;
      const plan = { id: planId, type: 'one-time', isActive: true };
      const activities = [
        { activity: 'Deposit plan 1 created', timestamp: new Date() },
        { activity: 'Deposit plan 1 executed', timestamp: new Date() },
      ];

      mockDepositPlanRepository.findOne.mockResolvedValue(plan);
      mockActivityLogModel.find.mockReturnValue({
        sort: jest.fn().mockResolvedValue(activities),
      });

      const result = await service.getDepositPlanHistory(planId);

      expect(result).toEqual({ plan, executionHistory: activities });
      expect(mockDepositPlanRepository.findOne).toHaveBeenCalledWith({
        where: { id: planId },
        relations: ['allocations', 'allocations.portfolio'],
      });
    });

    it('should throw NotFoundException if plan is not found', async () => {
      const planId = 999;
      mockDepositPlanRepository.findOne.mockResolvedValue(null);

      await expect(service.getDepositPlanHistory(planId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('rollbackLastDeposit', () => {
    it('should rollback the last deposit successfully', async () => {
        const mockDeposit = { 
          id: 1, 
          amount: 1000, 
          referenceCode: 'DEP001',
          allocations: [
            { id: 1, amount: 600, portfolio: { id: 1, balance: 1000 } },
            { id: 2, amount: 400, portfolio: { id: 2, balance: 800 } },
          ]
        };
      
        mockConnection.createQueryRunner().manager.findOne.mockResolvedValue(mockDeposit);
      
        await service.rollbackLastDeposit('DEP001');
      
        expect(mockConnection.createQueryRunner().manager.save).toHaveBeenCalledTimes(2); // Saving updated portfolios
        expect(mockConnection.createQueryRunner().manager.remove).toHaveBeenCalledTimes(2); // Removing allocations and deposit
        expect(mockConnection.createQueryRunner().commitTransaction).toHaveBeenCalled();
        expect(mockCacheManager.del).toHaveBeenCalledWith('portfolios');
      });

    it('should throw NotFoundException if no deposit is found', async () => {
      mockConnection.createQueryRunner().manager.findOne.mockResolvedValue(null);

      await expect(service.rollbackLastDeposit('NONEXISTENT')).rejects.toThrow(NotFoundException);
      expect(mockConnection.createQueryRunner().rollbackTransaction).toHaveBeenCalled();
    });

    it('should rollback transaction if error occurs during rollback process', async () => {
      const mockDeposit = { 
        id: 1, 
        amount: 1000, 
        referenceCode: 'DEP001',
        allocations: [
          { id: 1, amount: 600, portfolio: { id: 1, balance: 1000 } },
        ]
      };

      mockConnection.createQueryRunner().manager.findOne.mockResolvedValue(mockDeposit);
      mockConnection.createQueryRunner().manager.save.mockRejectedValue(new Error('Database error'));

      await expect(service.rollbackLastDeposit('DEP001')).rejects.toThrow('Database error');
      expect(mockConnection.createQueryRunner().rollbackTransaction).toHaveBeenCalled();
    });
  });
});