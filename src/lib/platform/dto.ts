export type CursorPage<TItem> = {
  items: TItem[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type PlatformMediaStatus = "created" | "uploading" | "ready" | "failed";

export type PlatformMediaDto = {
  id: string;
  url: string | null;
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
  status: PlatformMediaStatus;
  altText?: string | null;
};

export type FeedScreenDto<TPost> = CursorPage<TPost> & {
  unreadCount?: number;
};

export type ProfileScreenDto<TProfile, TPost> = {
  profile: TProfile;
  posts: CursorPage<TPost>;
};

export type NotificationScreenDto<TNotification> = CursorPage<TNotification> & {
  unreadCount: number;
};

export type GalleryScreenDto<TAsset> = CursorPage<TAsset> & {
  hiddenCount?: number;
  selectedTag?: string | null;
};

export type MessagesScreenDto<TThread, TMessage> = {
  threads: CursorPage<TThread>;
  activeThread: {
    id: string;
    messages: CursorPage<TMessage>;
  } | null;
};

export type PeopleScreenDto<TPerson> = CursorPage<TPerson> & {
  filters: string[];
};

export type MarketScreenDto<TListing> = CursorPage<TListing> & {
  categories: string[];
};
