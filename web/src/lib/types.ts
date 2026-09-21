export interface Product { id: number; code: string; name: string; group: string }
export interface Channel { id: number; name: string; code: string }
export interface BarcodeItem { id: number; name: string; code: string }
export interface MealCard { id: number; name: string; posName: string }
export interface AllData { products: Product[]; channels: Channel[]; barcodes: BarcodeItem[]; mealCards: MealCard[] }
export interface PublicData extends AllData { meta: { version: number; updatedAt: string | null; docVersion?: string | null } }
export interface AdminData extends AllData { version: number }
export interface Me { username: string; version: string; commit: string; startedAt: string }
export interface Change { id: number; at: string; username: string | null; summary: string; version: number }

export interface SectionPreview {
  key: string; label: string; added: number; updated: number; removed: number; unchanged: number;
  samples: { added: string[]; removed: string[]; updated: { label: string; changes: { label: string; from: string; to: string }[] }[] };
}
export interface ImportResponse {
  dry: boolean; mode: "merge" | "replace"; applied?: boolean; version?: number; notes: string[]; sections: SectionPreview[];
}

export interface DocVersionPublic { label: string; kind: "snapshot" | "pdf"; note: string; publishedAt: string | null; current: boolean }
export interface DocSnapshot {
  generatedAt: string;
  products: { code: string; name: string; group: string }[];
  channels: { name: string; code: string }[];
  mealCards: { name: string; posName: string }[];
}
export interface DocSelected extends DocVersionPublic { snapshot: DocSnapshot | null; pdfUrl: string | null }
export interface DocPublic { versions: DocVersionPublic[]; selected: DocSelected | null }
export interface DocAdmin {
  current: string | null;
  versions: (DocVersionPublic & { id: number; publishedBy: string | null; pdfSize: number })[];
  suggestion: {
    baseline: string | null; hasChanges: boolean; note: string;
    changes: { key: string; label: string; added: number; updated: number; removed: number }[];
  };
}
