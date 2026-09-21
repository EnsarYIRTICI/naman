export interface Product { id: number; code: string; name: string; group: string }
export interface Channel { id: number; name: string; code: string }
export interface BarcodeItem { id: number; name: string; code: string }
export interface MealCard { id: number; name: string; posName: string }
export interface AllData { products: Product[]; channels: Channel[]; barcodes: BarcodeItem[]; mealCards: MealCard[] }
export interface PublicData extends AllData { meta: { version: number; updatedAt: string | null } }
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
