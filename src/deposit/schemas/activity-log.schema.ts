import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema()
export class ActivityLog extends Document {
  @Prop()
  activity: string;

  @Prop()
  timestamp: Date;
}

export const ActivityLogSchema = SchemaFactory.createForClass(ActivityLog);