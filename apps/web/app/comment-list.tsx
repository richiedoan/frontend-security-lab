export interface Comment {
  id: string;
  authorId: string;
  text: string;
}

export function CommentList({ comments }: { comments: readonly Comment[] }) {
  return comments.length ? (
    <ul>
      {comments.map((comment) => (
        <li key={comment.id}>
          <strong>{comment.authorId}</strong>
          <p className="comment-text">{comment.text}</p>
        </li>
      ))}
    </ul>
  ) : <p>No comments yet.</p>;
}
