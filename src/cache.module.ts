import { Module } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-ioredis-yet';
import type { RedisClientOptions } from 'redis';

@Module({
  imports: [
    NestCacheModule.registerAsync<RedisClientOptions>({
      useFactory: () => ({
        store: redisStore,
        host: 'localhost',
        port: 6379,
        ttl: 60 * 60 // 1 hour
      }),
    }),
  ],
  exports: [NestCacheModule],
})
export class CacheModule {}