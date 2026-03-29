import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { FiduxKanbanController } from './fidux-kanban.controller';
import { FiduxKanbanService } from './fidux-kanban.service';

@Module({
    imports: [AuthModule],
    controllers: [FiduxKanbanController],
    providers: [FiduxKanbanService],
})
export class FiduxKanbanModule {}
