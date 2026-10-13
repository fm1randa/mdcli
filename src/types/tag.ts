interface Tag {
  id: number;
  nome: string;
  status: boolean;
  cor: string;
}

export type TagsResponse = Tag[];

export interface NormalizedTag {
  id: number;
  name: string;
  color: string;
  active: boolean;
}

export interface CreateTagPayload {
  nome: string;
  cor: string;
  status: boolean;
}

export interface CreateTagResponse {
  id: number;
  nome: string;
  status: boolean;
  cor: string;
}
