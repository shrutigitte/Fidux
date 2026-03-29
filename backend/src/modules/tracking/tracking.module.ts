import { Module } from '@nestjs/common';
import { TrackingGateway } from './tracking.gateway';

@Module({
    providers: [TrackingGateway],
})
export class TrackingModule { }
