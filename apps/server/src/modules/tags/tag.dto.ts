/**
 * `TagService`'s own vocabulary (spec §128–129) — never a `Tag` entity past this layer.
 */
export interface TagView {
  id: string;
  /** NFKC-normalized, casefolded canonical form. */
  name: string;
  displayName: string;
  createdAt: Date;
}

export interface TagListPage {
  tags: TagView[];
  nextCursor: string;
  hasMore: boolean;
}
