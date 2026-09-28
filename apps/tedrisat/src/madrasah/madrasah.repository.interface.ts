export interface IMadrasah {
  id: string;
  handle: string;
  name: string;
  description: string | null;
  coverHue: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IMadrasahWithNazirs extends IMadrasah {
  nazirIds: string[];
}

export interface IPaginatedMadrasahs {
  items: IMadrasahWithNazirs[];
  total: number;
  page: number;
  limit: number;
}

export interface ICreateMadrasah {
  handle: string;
  name: string;
  description?: string;
  coverHue?: number;
  createdBy: string;
}

export interface IUpdateMadrasah {
  handle?: string;
  name?: string;
  description?: string;
  coverHue?: number;
}
