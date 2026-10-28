import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class TransferDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  amount!: number;
}
