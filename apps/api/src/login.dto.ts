import { IsIn, IsString } from 'class-validator';
import type { LabUserId } from './lab-data';

const LAB_USER_IDS: readonly LabUserId[] = ['alice', 'bob', 'admin'];

export class LoginDto {
  @IsString()
  @IsIn(LAB_USER_IDS)
  username!: LabUserId;
}
