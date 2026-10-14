interface CategoryDfcDre {
  id: number;
  tipo: string[];
  label: string;
}

interface CategoryMeta {
  dfc: CategoryDfcDre[];
  dre: CategoryDfcDre[];
}

interface CategoryPermissions {
  visivel: boolean;
  acoes: {
    editar: boolean;
    excluir: boolean;
  };
  lancamento?: {
    tipo?: {
      c: string;
      v: string[];
    };
    conta?: {
      tipoInvestimento?: {
        c: string;
        v: number[];
      };
    };
    contaDestino?: {
      tipo?: {
        c: string;
        v: string[];
      };
    };
    contaOrigem?: {
      tipo?: {
        c: string;
        v: string[];
      };
      tipoInvestimento?: {
        c: string;
        v: number[];
      };
    };
  };
}

export interface Category {
  id: number;
  nome: string;
  nomeRel: string;
  tipo: 'd' | 'r' | 't';
  status: boolean;
  permissoes: CategoryPermissions;
  _ordenacao: string;
  sistema: boolean;
  tipoL?: number;
  /** Parent category ID. Absent on top-level categories. */
  pai?: number;
}

export interface CategoriesResponse {
  meta: CategoryMeta;
  items: Category[];
}

export interface CreateCategoryPayload {
  nome: string;
  nomeRel: string;
  tipo: 'd' | 'r';
  /** 0 for a top-level category; the web app sends the parent ID as a string. */
  pai: number | string;
}

export type UpdateCategoryPayload = Category & { pai: number };

export interface NormalizedCategory {
  id: number;
  name: string;
  type: 'expense' | 'income' | 'transfer';
  active: boolean;
  system: boolean;
}
