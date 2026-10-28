import { IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateDocumentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title!: string;
}
