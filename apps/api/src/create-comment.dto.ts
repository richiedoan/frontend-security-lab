import { IsString, Matches, MaxLength } from 'class-validator';

export class CreateCommentDto {
  @IsString()
  @Matches(/\S/u, { message: 'text must contain non-whitespace characters' })
  @MaxLength(1000)
  text!: string;
}
