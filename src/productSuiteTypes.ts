export type ProductSuiteSlot = "product-3d" | "model-front" | "model-angle" | "model-back" | "product-detail";
export type ProductSuiteStatus = "queued" | "running" | "partial" | "done" | "error";
export type ProductSuiteGender = "female" | "male";
export type ProductSuiteBodyType = "slim" | "muscular" | "plus" | "curvy" | "hourglass";
export interface ProductSuiteMedia { id: string; fileName: string; dataUrl: string; mimeType: string; size?: number; }
export interface ProductSuiteItem { slot: ProductSuiteSlot; label: string; status: ProductSuiteStatus | "done" | "error"; prompt: string; defaultPrompt?: string; resultUrl: string; error: string; }
export interface ProductSuite { id: string; status: ProductSuiteStatus; createdAt: string; updatedAt: string; input: { model: "kling" | "nanobanana"; nanoModel: string; gender: ProductSuiteGender; bodyType: ProductSuiteBodyType; backgroundMode: "white" | "custom"; aspectRatio: "4:5"; resolution: "2k"; productName: string; sellingPoints: string; style: string; prompts: Record<ProductSuiteSlot, string> }; items: ProductSuiteItem[]; }
export interface CreateProductSuiteInput { images: ProductSuiteMedia[]; backgroundImages?: ProductSuiteMedia[]; model: "kling" | "nanobanana"; gender: ProductSuiteGender; bodyType: ProductSuiteBodyType; backgroundMode: "white" | "custom"; productName: string; sellingPoints: string; style: string; prompts: Partial<Record<ProductSuiteSlot, string>>; }
