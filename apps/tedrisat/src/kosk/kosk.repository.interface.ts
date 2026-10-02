export interface IKosk {
  id: string;
  ownerId: string;
  madrasahId: string | null;
  name: string;
  handle: string | null;
  description: string | null;
  coverHue: number;
  isPrivate: boolean;
  field: string | null;
  level: string | null;
  tags: string[];
  verified: boolean;
  featured: boolean;
  rating: number;
  ratingCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/** The medrese a köşk is affiliated with, as köşk responses carry it. */
export interface IKoskMadrasahRef {
  id: string;
  name: string;
  handle: string;
}

export interface IKoskWithStats extends IKosk {
  madrasah: IKoskMadrasahRef | null;
  courseCount: number;
  studentCount: number;
  muderrisCount: number;
  followerCount: number;
  isFollowing: boolean;
}

export interface IPaginatedKosks {
  items: IKoskWithStats[];
  total: number;
  page: number;
  limit: number;
}

export interface ICreateKosk {
  ownerId: string;
  name: string;
  handle?: string;
  description?: string;
  coverHue?: number;
  isPrivate?: boolean;
  field?: string;
  level?: string;
  tags?: string[];
  verified?: boolean;
  featured?: boolean;
  rating?: number;
  ratingCount?: number;
}

export interface IUpdateKosk {
  name?: string;
  handle?: string;
  description?: string;
  coverHue?: number;
  isPrivate?: boolean;
  field?: string;
  level?: string;
  tags?: string[];
  verified?: boolean;
  featured?: boolean;
  rating?: number;
  ratingCount?: number;
}

/** A köşk as it appears in a caller's role summary (`GET /me`, MDRS-104). */
export interface IKoskRef {
  id: string;
  name: string;
}

export interface IKoskRepository {
  findAll(
    userId: string,
    limit: number,
    offset: number
  ): Promise<IKoskWithStats[]>;
  count(): Promise<number>;
  findById(id: string, userId: string): Promise<IKoskWithStats | null>;
  findOwnerId(id: string): Promise<string | null>;
  findOwnedBy(ownerId: string): Promise<IKoskRef[]>;
  ownsAny(ownerId: string): Promise<boolean>;
  create(kosk: ICreateKosk): Promise<IKosk>;
  update(id: string, updates: IUpdateKosk): Promise<IKosk | null>;
  delete(id: string): Promise<boolean>;
  affiliate(koskId: string, madrasahId: string): Promise<boolean>;
  detach(koskId: string, madrasahId: string): Promise<boolean>;
  leaveMadrasah(koskId: string): Promise<boolean>;
  follow(userId: string, koskId: string): Promise<boolean>;
  unfollow(userId: string, koskId: string): Promise<boolean>;
}
