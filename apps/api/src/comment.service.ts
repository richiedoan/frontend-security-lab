import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { LabUserId } from './lab-data';
import { EXECUTION_PAYLOAD, STORAGE_PAYLOAD, LEGACY_COMBINED_PAYLOAD } from './xss-lab';

export interface Comment {
  readonly id: string;
  readonly authorId: LabUserId;
  readonly text: string;
}

@Injectable()
export class CommentService {
  private readonly comments: Comment[] = [];

  list(): readonly Comment[] {
    return this.comments;
  }

  create(authorId: LabUserId, text: string): Comment {
    const comment = { id: randomUUID(), authorId, text };
    this.comments.push(comment);
    return comment;
  }

  removeXssDemo(kind?: 'execution' | 'storage'): number {
    const payloads = kind === 'execution' ? [EXECUTION_PAYLOAD]
      : kind === 'storage' ? [STORAGE_PAYLOAD]
      : [EXECUTION_PAYLOAD, STORAGE_PAYLOAD, LEGACY_COMBINED_PAYLOAD];
    let deleted = 0;
    for (let index = this.comments.length - 1; index >= 0; index--) {
      if (payloads.includes(this.comments[index].text)) {
        this.comments.splice(index, 1);
        deleted++;
      }
    }
    return deleted;
  }
}
