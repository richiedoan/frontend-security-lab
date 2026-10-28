import { Body, Controller, Delete, Get, Post, Req, UseGuards } from '@nestjs/common';
import { CommentService, type Comment } from './comment.service';
import { CreateCommentDto } from './create-comment.dto';
import type { AuthenticatedRequest } from './request-types';
import { SessionAuthGuard } from './session-auth.guard';

@Controller('comments')
@UseGuards(SessionAuthGuard)
export class CommentController {
  constructor(private readonly comments: CommentService) {}

  @Get()
  list(): { comments: readonly Comment[] } {
    return { comments: this.comments.list() };
  }

  @Post()
  create(@Body() input: CreateCommentDto, @Req() request: AuthenticatedRequest): Comment {
    return this.comments.create(request.user.id, input.text);
  }

  @Delete('xss-demo')
  removeXssDemo(): { deleted: number } {
    return { deleted: this.comments.removeXssDemo() };
  }

  @Delete('xss-demo/execution')
  removeExecutionDemo(): { deleted: number } {
    return { deleted: this.comments.removeXssDemo('execution') };
  }

  @Delete('xss-demo/storage')
  removeStorageDemo(): { deleted: number } {
    return { deleted: this.comments.removeXssDemo('storage') };
  }

}
