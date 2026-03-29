import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';

import { pluginError } from './plugin.errors';

type RateLimitPolicy = {
    limitPerMinute: number;
    burstMultiplier: number;
    burstWindowSeconds: number;
};

type RateLimitState = {
    minuteWindowStartMs: number;
    minuteCount: number;
    burstWindowStartMs: number;
    burstCount: number;
};

const minuteMs = 60_000;

@Injectable()
export class PluginRateLimitService {
    private readonly state = new Map<string, RateLimitState>();
    private readonly maxEntries = 50_000;

    enforce(
        routeKey: string,
        authorizationHeader: string | undefined,
        rawIp: string | undefined,
        policy: RateLimitPolicy,
    ) {
        this.maybeCompact();

        const tokenKey = this.buildTokenSubjectKey(authorizationHeader);
        const ipKey = this.buildIpSubjectKey(rawIp);
        const now = Date.now();
        this.consume(routeKey, `token:${tokenKey}`, now, policy);
        this.consume(routeKey, `ip:${ipKey}`, now, policy);
    }

    private consume(routeKey: string, subjectKey: string, now: number, policy: RateLimitPolicy) {
        const stateKey = `${routeKey}:${subjectKey}`;
        const current = this.state.get(stateKey) ?? this.newState(now);

        if (now - current.minuteWindowStartMs >= minuteMs) {
            current.minuteWindowStartMs = now;
            current.minuteCount = 0;
        }

        const burstWindowMs = Math.max(1, policy.burstWindowSeconds) * 1000;
        if (now - current.burstWindowStartMs >= burstWindowMs) {
            current.burstWindowStartMs = now;
            current.burstCount = 0;
        }

        const burstBase = Math.max(1, Math.ceil(policy.limitPerMinute * (policy.burstWindowSeconds / 60)));
        const burstLimit = Math.max(1, Math.ceil(burstBase * Math.max(1, policy.burstMultiplier)));

        if (current.minuteCount >= policy.limitPerMinute || current.burstCount >= burstLimit) {
            throw pluginError.tooManyRequests(
                'RATE_LIMITED',
                'Rate limit exceeded for plugin endpoint',
                {
                    routeKey,
                    subject: subjectKey,
                    limitPerMinute: policy.limitPerMinute,
                    burstLimit,
                    burstWindowSeconds: policy.burstWindowSeconds,
                },
            );
        }

        current.minuteCount += 1;
        current.burstCount += 1;
        this.state.set(stateKey, current);
    }

    private buildTokenSubjectKey(authorizationHeader: string | undefined) {
        const bearerToken = this.extractBearerToken(authorizationHeader);
        return bearerToken ? this.sha256(bearerToken) : 'no-token';
    }

    private buildIpSubjectKey(rawIp: string | undefined) {
        return this.normalizeIp(rawIp);
    }

    private newState(now: number): RateLimitState {
        return {
            minuteWindowStartMs: now,
            minuteCount: 0,
            burstWindowStartMs: now,
            burstCount: 0,
        };
    }

    private extractBearerToken(authorizationHeader: string | undefined) {
        if (!authorizationHeader) {
            return null;
        }

        const [scheme, token] = authorizationHeader.split(' ');
        if (!scheme || !token || scheme.toLowerCase() !== 'bearer') {
            return null;
        }

        const cleanToken = token.trim();
        return cleanToken.length > 0 ? cleanToken : null;
    }

    private normalizeIp(rawIp: string | undefined) {
        if (!rawIp) {
            return 'unknown-ip';
        }

        return rawIp
            .split(',')[0]
            .trim()
            .toLowerCase();
    }

    private maybeCompact() {
        if (this.state.size <= this.maxEntries) {
            return;
        }

        const now = Date.now();
        for (const [key, value] of this.state.entries()) {
            if (now - value.minuteWindowStartMs > 5 * minuteMs) {
                this.state.delete(key);
            }
        }
    }

    private sha256(value: string) {
        return createHash('sha256').update(value).digest('hex');
    }
}
